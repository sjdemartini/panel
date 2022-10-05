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


import panel as pn
import numpy as np
import holoviews as hv

pn.extension(sizing_mode="stretch_width")


# This example demonstrates how to dynamically add and remove plots from a layout (in this case a Column) using the \`\`pop\`\` and \`\`append\`\` methods (requires a live Python server):

# In[ ]:


slider = pn.widgets.IntSlider(name='N', start=0, end=5)

column = pn.Column('This column will be populated with N Plots', sizing_mode="stretch_width")

def set_plots(event):
    nplots = event.new-event.old
    for i in range(abs(nplots)):
        if nplots < 0:
            column.pop(len(column)-1)
        elif nplots > 0:
            column.append(hv.Scatter(np.random.randn(1000, 2)).opts(responsive=True, height=300))
            
    column[0]=f'This column will be populated with {event.new} Plots'
    
slider.param.watch(set_plots, 'value')
slider.value = 1

pn.Row(pn.Column(slider, sizing_mode="fixed", width=300), column, sizing_mode="stretch_width")


# ## App
# 
# Lets wrap it into nice template that can be served via \`panel serve dynamic_plot_layout.ipynb\`

# In[ ]:


description = "This example demonstrates **how to dynamically add and remove plots** from a layout (in this case a Column) using the \`\`pop\`\` and \`\`append\`\` methods."
pn.template.FastListTemplate(site="Panel", title="Dynamic Plot Layout", sidebar=[slider], main=[description, column]).servable();



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