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
  const env_spec = ['https://cdn.holoviz.org/panel/0.14.0/dist/wheels/bokeh-2.4.3-py3-none-any.whl', 'https://cdn.holoviz.org/panel/0.14.0/dist/wheels/panel-0.14.0-py3-none-any.whl', 'numpy']
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


import numpy as np
import panel as pn

pn.extension('plotly')


# Since Plotly plots are represented as simple JavaScript objects, we can easily define a JS callback to modify the data and trigger an update in a plot:

# In[ ]:


xs, ys = np.mgrid[-3:3:0.2, -3:3:0.2]
contour = dict(ncontours=4, type='contour', z=np.sin(xs**2*ys**2))
layout = {'width': 600, 'height': 500, 'margin': {'l': 8, 'b': 8, 'r': 8, 't': 8}}
fig = dict(data=contour, layout=layout)
plotly_pane = pn.pane.Plotly(fig, width=600, height=500)

buttons = pn.widgets.RadioButtonGroup(value='Medium', options=['Low', 'Medium', 'High'], button_type="success")

range_callback = """
var ncontours = [2, 5, 10]
target.data[0].ncontours = ncontours[source.active]
target.properties.data.change.emit()
"""

buttons.jslink(plotly_pane, code={'active': range_callback})

component=pn.Column(buttons, plotly_pane)
component


# ## App
# 
# Lets wrap it into nice template that can be served via \`panel serve plotly_link.ipynb\`

# In[ ]:


pn.template.FastListTemplate(
    site="Panel", title="Plotly JS Links", main_max_width="650px",
    main=[
        pn.pane.Markdown("Since Plotly plots are represented as simple JavaScript objects, we can easily define a **JS callback** to modify the data and trigger an update in a plot. \\n\\nThis allows you to **export your app as a static HTML file**.", sizing_mode="stretch_width"), 
        component
    ]
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