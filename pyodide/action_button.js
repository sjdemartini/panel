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
  const env_spec = ['https://cdn.holoviz.org/panel/0.14.0/dist/wheels/bokeh-2.4.3-py3-none-any.whl', 'https://cdn.holoviz.org/panel/0.14.0/dist/wheels/panel-0.14.0-py3-none-any.whl', 'param']
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


import param
import panel as pn

pn.extension(sizing_mode="stretch_width")


# ## param.Action Example
# 
# This example demonstrates how to use \`\`param.Action\`\` to trigger an update in a method that depends on that parameter. Actions can trigger any function, but if we simply want to trigger a method that depends on that action, then we can define a small \`\`lambda\`\` function that triggers the parameter explicitly.

# In[ ]:


class ActionExample(param.Parameterized):
    """
    Demonstrates how to use param.Action to trigger an update.
    """

    action = param.Action(lambda x: x.param.trigger('action'), label='Click here!')
    
    number = param.Integer(default=0)
        
    @param.depends('action')
    def get_number(self):
        self.number += 1
        return self.number
    
action_example = ActionExample()
component = pn.Column(
    pn.Row(
        pn.Column(pn.panel(action_example, show_name=False, margin=0, widgets={"action": {"button_type": "primary"}, "number": {"disabled": True}}),
            '**Click the button** to trigger an update in the output.'),
        pn.panel(action_example.get_number, width=300), max_width=600)
)
component


# ## App
# 
# Lets wrap it into nice template that can be served via \`panel serve action_button.ipynb\`

# In[ ]:


pn.template.FastListTemplate(
    site="Panel", title="param.Action Example", 
    main=[
        "This example demonstrates **how to use \`\`param.Action\`\` to trigger an update** in a method that depends on that parameter.\\n\\nActions can trigger any function, but if we simply want to trigger a method that depends on that action, then we can define a small \`\`lambda\`\` function that triggers the parameter explicitly.",
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