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
  const env_spec = ['https://cdn.holoviz.org/panel/0.14.0/dist/wheels/bokeh-2.4.3-py3-none-any.whl', 'https://cdn.holoviz.org/panel/0.14.0/dist/wheels/panel-0.14.0-py3-none-any.whl', 'holoviews>=1.15.1', 'numpy']
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


import time
import panel as pn
import holoviews as hv
import numpy as np

pn.extension(loading_spinner='dots', loading_color='#00aa41', sizing_mode="stretch_width")


# Every pane, widget and layout provides the \`loading\` parameter. When set to \`True\` a spinner will overlay the panel and indicate that the panel is currently loading. When you set \`loading\` to false the spinner is removed. Using the \`pn.extension\` or by setting the equivalent parameters on \`pn.config\` we can select between different visual styles and colors for the loading indicator.
# 
# Using the \`pn.param.set_values\` context manager we can set the \`loading\` parameter to \`True\` while we perform some computation (here simulated using \`time.sleep\`:

# In[ ]:


button = pn.widgets.Button(name="Update", margin=(0, 32, 0, 57), button_type="primary")

def random_plot():
    return hv.Points(np.random.rand(100, 2)).opts(
        width=400, height=400, size=8, color="#838383")

hv_pane = pn.pane.HoloViews(random_plot())

def update(event):
    with pn.param.set_values(hv_pane, loading=True):
        time.sleep(1.5)
        hv_pane.object = random_plot()
    
button.on_click(update)

component = pn.Column(button, hv_pane)
component


# ## App
# 
# Lets wrap it into nice template that can be served via \`panel serve loading_spinner.ipynb\`

# In[ ]:


pn.template.FastListTemplate(
    site="Panel", 
    title="Loading Spinner", 
    main=[
        """**Every pane, widget and layout provides the \`loading\` parameter**.\\n\\nWhen set to \`True\` a spinner will overlay the panel and indicate that the panel is currently loading. When you set \`loading\` to false the spinner is removed.\\n\\nUsing the \`pn.extension\` or by setting the equivalent parameters on \`pn.config\` we can select between **different visual styles and colors** for the loading indicator.""",
        component
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