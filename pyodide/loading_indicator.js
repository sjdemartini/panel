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
import holoviews.plotting.bokeh

pn.extension(loading_spinner='dots', loading_color='#00aa41', sizing_mode="stretch_width")
hv.extension('bokeh')


# Every pane, widget and layout provides the **\`loading\` parameter**. When set to \`True\` a spinner will overlay the panel and indicate that the panel is currently loading. When you set \`loading\` to false the spinner is removed. 
# 
# Using the \`pn.extension\` or by setting the equivalent parameters on \`pn.config\` we can select between different visual styles and colors for the loading indicator.
# 
# \`\`\`python
# pn.extension(loading_spinner='dots', loading_color='#00aa41')
# \`\`\`
# 
# We can enable the loading indicator for reactive functions annotated with \`depends\` or \`bind\` globally using:
# 
# \`\`\`python
# pn.param.ParamMethod.loading_indicator = True
# \`\`\`

# Alternatively we can enable it for a specific function by passing the \`loading_indicator=True\` argument into \`pn.panel\` which returns a \`ParamMethod\`/\`ParamFunction\` object with the parameter set:

# In[ ]:


button = pn.widgets.Button(name="UPDATE", button_type="primary")

def random_plot(event):
    if event: time.sleep(2)
    return hv.Points(np.random.rand(100, 2)).opts(
        width=400, height=400, size=8, color="green")

component = pn.Column(button, pn.panel(pn.bind(random_plot, button), loading_indicator=True))
component


# ## App
# 
# Lets wrap it into nice template that can be served via \`panel serve download_upload_csv.ipynb\`

# In[ ]:


description = """
Every pane, widget and layout provides the **\`loading\` parameter**. When set to \`True\` a spinner will overlay the panel and indicate that the panel is currently loading. When you set \`loading\` to false the spinner is removed. 

Using the \`pn.extension\` or by setting the equivalent parameters on \`pn.config\` we can select between different visual styles and colors for the loading indicator.

\`\`\`python
pn.extension(loading_spinner='dots', loading_color='#00aa41')
\`\`\`

We can enable the loading indicator for reactive functions annotated with \`depends\` or \`bind\` globally using:

\`\`\`python
pn.param.ParamMethod.loading_indicator = True
\`\`\`
"""
pn.template.FastListTemplate(
    site="Panel", title="Loading Indicator", 
    main=[ description, component]).servable();



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