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
  const env_spec = ['https://cdn.holoviz.org/panel/0.14.0/dist/wheels/bokeh-2.4.3-py3-none-any.whl', 'https://cdn.holoviz.org/panel/0.14.0/dist/wheels/panel-0.14.0-py3-none-any.whl', 'numpy', 'pandas']
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
import pandas as pd
import panel as pn

pn.extension('tabulator', sizing_mode="stretch_width")


# This example demonstrates the powerful streaming capabilities of the \`Tabulator\` widget.

# In[ ]:


df = pd.DataFrame(np.random.randn(10, 4), columns=list('ABCD')).cumsum()

rollover = pn.widgets.IntInput(name='Rollover', value=15)
follow = pn.widgets.Checkbox(name='Follow', value=True, align='end')

tabulator = pn.widgets.Tabulator(df, height=450)

def color_negative_red(val):
    """
    Takes a scalar and returns a string with
    the css property \`'color: red'\` for negative
    strings, black otherwise.
    """
    color = 'red' if val < 0 else 'green'
    return 'color: %s' % color

tabulator.style.applymap(color_negative_red)

def stream():
    data = df.iloc[-1] + np.random.randn(4)
    tabulator.stream(data, rollover=rollover.value, follow=follow.value)

cb = pn.state.add_periodic_callback(stream, 200)

component = pn.Column(
    pn.Row(cb.param.period, rollover, follow, width=400),
    tabulator,
)
component


# ## App
# 
# Lets wrap it into nice template that can be served via \`panel serve streaming_tabulator.ipynb\`

# In[ ]:


pn.template.FastListTemplate(
    site="Panel", 
    title="Streaming Tabulator", 
    main=[
        "This example demonstrates the **powerful streaming capabilities** of Panel and the \`Tabulator\` widget.",
        component,
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