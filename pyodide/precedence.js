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


import panel as pn
import param

pn.extension()


# This example demonstrates how to order and hide widgets by means of the \`\`precedence\`\` and  \`\`display_threshold\`\` attributes.
# 
# Each \`\`Parameter\`\` object has a \`\`precedence\`\` attribute that is defined as follows  in the documentation of \`\`param\`\`:
# 
# > \`\`precedence\`\` is a value, usually in the range 0.0 to 1.0, that allows the order of Parameters in a class to be defined (for e.g. in GUI menus).  
# > A negative precedence indicates a parameter that should be hidden in e.g. GUI menus.
# 
# A \`Param\` pane has a \`\`display_threshold\`\` attribute defaulting to 0 and defined as follows:
# 
# > Parameters with precedence below this value are not displayed.
# 
# The interactive example below helps to understand how the interplay between these two attributes affects the display of widgets.
# 
# The \`\`PrecedenceTutorial\`\` class emulates a dummy app whose display we want to control and that consists of three input parameters, \`\`x\`\`, \`\`y\`\` and \`\`z\`\`. These parameters will be displayed by \`panel\` with their associated default widgets. Additionally, the class declares the four parameters that will control the dummy app display: \`\`x_precedence\`\`, \`\`y_precedence\`\` and \`\`z_precedence\`\` and \`\`dummy_app_display_threshold\`\`.

# In[ ]:


class Precedence(param.Parameterized):

    # Parameters of the dummy app.
    x = param.Number(precedence=-1)
    y = param.Boolean(precedence=3)
    z = param.String(precedence=2)

    # Parameters of the control app.
    x_precedence = param.Number(default=x.precedence, bounds=(-10, 10), step=1)
    y_precedence = param.Number(default=y.precedence, bounds=(-10, 10), step=1)
    z_precedence = param.Number(default=z.precedence, bounds=(-10, 10), step=1)
    dummy_app_display_threshold = param.Number(default=1, bounds=(-10, 10), step=1)
    
    def __init__(self):
        super().__init__()
        # Building the dummy app as a Param pane in here so that its \`\`display_threshold\`\`
        # parameter can be accessed and linked via @param.depends(...).
        self.dummy_app = pn.Param(
            self.param,
            parameters=["x", "y", "z"],
            widgets={
                "x": {"background": "#fac400"},
                "y": {"background": "#07d900"},
                "z": {"background": "#00c0d9"},
            },
            show_name=False
        )

    # Linking the two apps here.
    @param.depends("dummy_app_display_threshold", "x_precedence", "y_precedence", "z_precedence", watch=True)
    def update_precedences_and_threshold(self):
        self.param.x.precedence = self.x_precedence
        self.param.y.precedence = self.y_precedence        
        self.param.z.precedence = self.z_precedence     
        self.dummy_app.display_threshold = self.dummy_app_display_threshold

precedence_model = Precedence()


# In[ ]:


# Bulding the control app as a Param pane too.
control_app = pn.Param(
    precedence_model.param,
    parameters=["x_precedence", "y_precedence", "z_precedence", "dummy_app_display_threshold"],
    widgets={
        "x_precedence": {"background": "#fac400"},
        "y_precedence": {"background": "#07d900"},
        "z_precedence": {"background": "#00c0d9"},
    },
    show_name=False
)


# In[ ]:


# Building the complete interactive example.
interactive_precedence_app = pn.Column(
    "## Precedence Example",
    "Moving the sliders of the control app should update the display of the dummy app.",
    pn.Row(
        pn.Column("**Control app**", control_app),
        pn.Column("**Dummy app**", precedence_model.dummy_app)
    )
)
interactive_precedence_app


# In[ ]:


pn.template.FastListTemplate(site="Panel", title="Parameter Precedence", main_max_width="700px",
                             main=[
                                 pn.pane.Markdown("This example demonstrates how to order and hide widgets by means of the **\`\`precedence\`\` and  \`\`display_threshold\`\`** parameter attributes.", sizing_mode="stretch_width"),
                                 interactive_precedence_app,
                             ]).servable();



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