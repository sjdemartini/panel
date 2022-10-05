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
  const env_spec = ['https://cdn.holoviz.org/panel/0.14.0/dist/wheels/bokeh-2.4.3-py3-none-any.whl', 'https://cdn.holoviz.org/panel/0.14.0/dist/wheels/panel-0.14.0-py3-none-any.whl']
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

pn.extension(sizing_mode="stretch_width")


# This example demonstrates how to sync widget state with the URL bar, restoring it from the URL parameters on page load and updating it when the widgets change. Note this example will only work when served with \`panel serve\`. In a notebook \`pn.state.location\` does not exist until after the first object has been displayed:

# In[ ]:


widget = pn.widgets.FloatSlider(name='Slider', start=0, end=10)
widget2 = pn.widgets.TextInput(name='Text')
widget3 = pn.widgets.RangeSlider(name='RangeSlider', start=0, end=10)

if pn.state.location:
    pn.state.location.sync(widget, {'value': 'slider_value'})
    pn.state.location.sync(widget2, {'value': 'text_value'})
    pn.state.location.sync(widget3, {'value': 'range_value'})

pn.Row(widget, widget2, widget3)


# ## App
# 
# Lets wrap it into nice template that can be served via \`panel serve sync_location.ipynb\`

# In[ ]:


pn.template.FastListTemplate(
    site="Panel", 
    title="Sync Location", 
    main=[
        "This example demonstrates **how to sync widget state with the URL bar**. The widgets values are set from the URL parameters on page load and the URL parameters are set when a widget value changes.",
        pn.Column(widget, widget2, widget3),
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