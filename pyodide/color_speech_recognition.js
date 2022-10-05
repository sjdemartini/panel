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

from panel.widgets import SpeechToText, GrammarList

pn.extension(sizing_mode="stretch_width")


# In[ ]:


speech_to_text_color = SpeechToText(button_type="light", continuous=True)

colors = [
    "aqua",
    "azure",
    "beige",
    "bisque",
    "black",
    "blue",
    "brown",
    "chocolate",
    "coral",
    "crimson",
    "cyan",
    "fuchsia",
    "ghostwhite",
    "gold",
    "goldenrod",
    "gray",
    "green",
    "indigo",
    "ivory",
    "khaki",
    "lavender",
    "lime",
    "linen",
    "magenta",
    "maroon",
    "moccasin",
    "navy",
    "olive",
    "orange",
    "orchid",
    "peru",
    "pink",
    "plum",
    "purple",
    "red",
    "salmon",
    "sienna",
    "silver",
    "snow",
    "tan",
    "teal",
    "thistle",
    "tomato",
    "turquoise",
    "violet",
    "white",
    "yellow",
]
src = "#JSGF V1.0; grammar colors; public <color> = " + " | ".join(colors) + " ;"
grammar_list = GrammarList()
grammar_list.add_from_string(src, 1)

speech_to_text_color.grammars = grammar_list


# In[ ]:


colors_html = "Try " + ", ".join(
    [f"<span style='background:{color};'>{color}</span>" for color in colors]
)
content = f"""
**Tap/click the microphone icon** and **say a color** to change the background color of the app.

Please **use Chrome** as it has the best support for the Speech to Text Api.
"""

content_panel = pn.pane.Markdown(content)
colors_panel = pn.pane.HTML(colors_html)


# In[ ]:


app = pn.Column(height=700, css_classes=["color-app"])
style_panel = pn.pane.HTML(width=0, height=0, sizing_mode="fixed")

result_panel = pn.pane.Markdown()

@pn.depends(speech_to_text_color, watch=True)
def update_result_panel(results_last):
    results_last = results_last.lower()
    if results_last in colors:
        app.background = results_last
        result_panel.object = "Result received: " + results_last
    else:
        app.background = "white"
        result_panel.object = "Result received: " + results_last + " (Not recognized)"


# In[ ]:


app[:] = [
    style_panel,
    content_panel,
    speech_to_text_color,
    result_panel,
    colors_html,
]
app


# ## App
# 
# Lets wrap it into nice template that can be served via \`panel serve color_speech_recognition.ipynb\`

# In[ ]:


pn.template.FastListTemplate(
    site="Panel", 
    title="Speech Recognition - Color App", 
    main=[app], main_max_width="768px"
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