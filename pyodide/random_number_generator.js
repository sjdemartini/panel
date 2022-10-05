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


import panel as pn
import numpy as np
pn.extension(sizing_mode="stretch_width")


# This example creates a **random number generator** that periodically updates every two seconds, or with a click of a button.
# 
# This demonstrates how to add a **periodic callback** and how to link a button and a toggle to a couple callbacks. The button to manually generate a random number and the toggle to toggle periodic generation of a random number.

# In[ ]:


def generate_random_number(event=None):
    static_text.value = np.random.randint(low=100000, high=200000)

def toggle_periodic_callback(event):
    if event.new is True:
        periodic_cb.start()
        periodic_toggle.name="STOP Periodic Generation"
    else:
        periodic_cb.stop()
        periodic_toggle.name="START Periodic Generation"
        
def update_period(event):
    periodic_cb.period = event.new

static_text = pn.widgets.StaticText(name='Periodic Random Number Generator',
                                    value='000000')

generate_button = pn.widgets.Button(name='GENERATE New Number')
generate_button.on_click(generate_random_number)

periodic_toggle = pn.widgets.Toggle(name='START Periodic Generation',
                                    value=False, button_type='primary')
periodic_toggle.param.watch(toggle_periodic_callback, 'value')

period = pn.widgets.Spinner(name="Period (ms)", value=500, step=50, start=50)
period.param.watch(update_period, 'value')

periodic_cb = pn.state.add_periodic_callback(
    generate_random_number, period=period.value, start=False)

col = pn.Column(generate_button, period, periodic_toggle, static_text)
col


# ## App
# 
# Lets wrap it into nice template that can be served via \`panel serve random_number_generator.ipynb\`

# In[ ]:


pn.template.FastListTemplate(
    site="Panel", 
    title="Random Number Generator", 
    main=[
        "This example creates a **random number generator** that updates periodically or with the click of a button.\\n\\nThis demonstrates how to add a **periodic callback** and how to link a button and a toggle to a couple of callbacks.",
        col,
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