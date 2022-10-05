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
  const env_spec = ['https://cdn.holoviz.org/panel/0.14.0/dist/wheels/bokeh-2.4.3-py3-none-any.whl', 'https://cdn.holoviz.org/panel/0.14.0/dist/wheels/panel-0.14.0-py3-none-any.whl', 'holoviews>=1.15.1', 'hvplot', 'pandas']
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
import hvplot.pandas

from bokeh.sampledata.autompg import autompg_clean

pn.extension(sizing_mode="stretch_width")


# This example demonstrates how to combine multiple columns of widgets into an overall layout.

# In[ ]:


quant = [None, 'mpg', 'cyl', 'displ', 'hp', 'weight', 'yr']
cat = [None, 'origin', 'mfr', 'yr']
combined = quant+cat[1:]

x = pn.widgets.Select(name='x', value='mpg', options=combined)
y = pn.widgets.Select(name='y', value='cyl', options=combined)
color = pn.widgets.Select(name='color', options=combined)
facet = pn.widgets.Select(name='facet', options=cat)

@pn.depends(x, y, color, facet)
def plot(x, y, color, facet):
    cmap = 'Category10' if color in cat else 'viridis'
    return autompg_clean.hvplot.scatter(
        x, y, color=color or 'green', by=facet, subplots=True, padding=0.1,
        cmap=cmap, responsive=True, min_height=500, size=100
    )

settings = pn.Row(pn.WidgetBox(x, y, color, facet))
pn.Column(
    '### Auto MPG Explorer', 
    settings,
    plot,
    width_policy='max'
)


# ## App
# 
# Lets wrap it into nice template that can be served via \`panel serve dynamic_widget_values.ipynb\`

# In[ ]:


pn.template.FastListTemplate(
    site="Panel", title="Auto MPG Explorer", sidebar=[settings], 
    main=["This example demonstrates **how to combine multiple columns of components into an overall layout**.", plot]
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