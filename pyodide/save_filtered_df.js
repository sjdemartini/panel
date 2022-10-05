importScripts("https://cdn.jsdelivr.net/pyodide/v0.21.3/full/pyodide.js");

function sendPatch(patch, buffers, msg_id) {
  self.postMessage({
    type: 'patch',
    patch: patch,
    buffers: buffers
  })
}

async function startApplication() {
  console.log("Loading pyodide!");
  self.postMessage({type: 'status', msg: 'Loading pyodide'})
  self.pyodide = await loadPyodide();
  self.pyodide.globals.set("sendPatch", sendPatch);
  console.log("Loaded!");
  await self.pyodide.loadPackage("micropip");
  const env_spec = ['https://cdn.holoviz.org/panel/0.14.0/dist/wheels/bokeh-2.4.3-py3-none-any.whl', 'https://cdn.holoviz.org/panel/0.14.0/dist/wheels/panel-0.14.0-py3-none-any.whl', 'pandas']
  for (const pkg of env_spec) {
    const pkg_name = pkg.split('/').slice(-1)[0].split('-')[0]
    self.postMessage({type: 'status', msg: `Installing ${pkg_name}`})
    await self.pyodide.runPythonAsync(`
      import micropip
      await micropip.install('${pkg}');
    `);
  }
  console.log("Packages loaded!");
  self.postMessage({type: 'status', msg: 'Executing code'})
  const code = `
  
import asyncio

from panel.io.pyodide import init_doc, write_doc

init_doc()

#!/usr/bin/env python
# coding: utf-8

# In[ ]:


import panel as pn

from bokeh.sampledata.autompg import autompg
from io import StringIO

pn.extension(sizing_mode="stretch_width")


# In[ ]:


years = pn.widgets.MultiChoice(
    name='Years', options=list(autompg.yr.unique()), margin=(0, 20, 0, 0)
)
mpg = pn.widgets.RangeSlider(
    name='Mile per Gallon', start=autompg.mpg.min(), end=autompg.mpg.max()
)

@pn.depends(years, mpg)
def filtered_mpg(yrs, mpg):
    df = autompg
    if years.value:
        df = autompg[autompg.yr.isin(yrs)]
    return df[(df.mpg >= mpg[0]) & (df.mpg <= mpg[1])]

@pn.depends(years, mpg)
def filtered_file(yr, mpg):
    df = filtered_mpg(yr, mpg)
    sio = StringIO()
    df.to_csv(sio)
    sio.seek(0)
    return sio

fd = pn.widgets.FileDownload(
    callback=filtered_file, filename='filtered_autompg.csv'
)

pn.Column(pn.Row(years, mpg), fd, pn.panel(filtered_mpg, width=600), width=600)


# ## App
# 
# Lets wrap it into nice template that can be served via \`panel serve save_filtered_df.ipynb\`

# In[ ]:


pn.template.FastListTemplate(
    site="Panel", 
    title="Save Filtered Dataframe", 
    main=[
        pn.Column(
            "This app demonstrates how to **filter and download a Pandas DataFrame**.",
            pn.pane.HTML("<div style='font-size: 100px;text-align: center'>🐼</div>", height=75, margin=(50,5,10,5)),
        ),
        pn.Column(years, mpg, fd), 
        pn.Column(filtered_mpg, height=600, scroll=True),
    ], main_max_width="768px",
).servable();



await write_doc()
  `
  const [docs_json, render_items, root_ids] = await self.pyodide.runPythonAsync(code)
  self.postMessage({
    type: 'render',
    docs_json: docs_json,
    render_items: render_items,
    root_ids: root_ids
  });
}

self.onmessage = async (event) => {
  const msg = event.data
  if (msg.type === 'rendered') {
    self.pyodide.runPythonAsync(`
    from panel.io.state import state
    from panel.io.pyodide import _link_docs_worker

    _link_docs_worker(state.curdoc, sendPatch, setter='js')
    `)
  } else if (msg.type === 'patch') {
    self.pyodide.runPythonAsync(`
    import json

    state.curdoc.apply_json_patch(json.loads('${msg.patch}'), setter='js')
    `)
    self.postMessage({type: 'idle'})
  } else if (msg.type === 'location') {
    self.pyodide.runPythonAsync(`
    import json
    from panel.io.state import state
    from panel.util import edit_readonly
    if state.location:
        loc_data = json.loads("""${msg.location}""")
        with edit_readonly(state.location):
            state.location.param.update({
                k: v for k, v in loc_data.items() if k in state.location.param
            })
    `)
  }
}

startApplication()