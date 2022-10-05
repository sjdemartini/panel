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
  const env_spec = ['https://cdn.holoviz.org/panel/0.14.0/dist/wheels/bokeh-2.4.3-py3-none-any.whl', 'https://cdn.holoviz.org/panel/0.14.0/dist/wheels/panel-0.14.0-py3-none-any.whl', 'matplotlib', 'numpy']
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


import matplotlib.pyplot as plt
import numpy as np
from matplotlib import cm
from matplotlib.figure import Figure
import panel as pn

pn.extension(sizing_mode="stretch_width", template="fast")


# ## Styling Matplotlib for Panel
# 
# In this example we will show how to style Matplotlib charts with Panel for both the \`default\` and the \`dark\` theme.
# 
# ![MatplotlibStyle.gif](https://assets.holoviews.org/panel/thumbnails/gallery/styles/matplotlib-styles.gif)

# ## Get or set the theme
# 
# When we use the Fast templates the \`theme\` can be found in the \`session_args\`.

# In[ ]:


def get_theme():
    return pn.state.session_args.get("theme", [b'default'])[0].decode()


# In[ ]:


theme=get_theme()
theme


# ## Select a nice accent color
# 
# Below we create some functionality to *cycle through* a list of nice accent colors. You would probably just set the \`accent_color\` and \`color\` for your specific use case.

# In[ ]:


nice_accent_colors = [
    ("#00A170", "white"), # Mint
    ("#DAA520", "white"), # Golden Rod
    ("#F08080", "white"), # Light Coral
    ("#4099da", "white"), # Summery Sky
    ("#2F4F4F", "white"), # Dark Slate Grey
    ("#A01346", "white"), # Fast
]


# In[ ]:


def get_nice_accent_color():
    """Returns the 'next' nice accent color"""
    if not "color_index" in pn.state.cache:
        pn.state.cache["color_index"]=0
    elif pn.state.cache["color_index"]==len(nice_accent_colors)-1:
        pn.state.cache["color_index"]=0
    else:
        pn.state.cache["color_index"]+=1
    return nice_accent_colors[pn.state.cache["color_index"]]


# In[ ]:


accent_color, color = get_nice_accent_color()
pn.pane.Markdown(f"# Color: {accent_color}", background=accent_color, height=70, margin=0, style={"color": color, "padding": "10px"})


# ## Matplotlib
# 
# There are nearly 30 builtin styles to matplotlib that can be activated with the \`plt.style.use\` function. The style names are available in the \`plt.style.available\` list.
# 
# Let's define a [\`Select\`](https://panel.holoviz.org/reference/widgets/Select.html) widget to explore the templates.

# In[ ]:


style=pn.widgets.Select(options=[style for style in sorted(plt.style.available) if not style.startswith("_")])


# If the theme is \`dark\` we will use the \`dark_background\` style as the default value.

# In[ ]:


if theme=="dark":
    style.value="dark_background"


# Lets define a plot

# In[ ]:


x = np.arange(-2, 8, .1)
y = .1 * x ** 3 - x ** 2 + 3 * x + 2

def get_plot(theme="default", accent_color=accent_color, style=style.value):
    plt.style.use("default") # Resets to default style. Just in case it was styled to something non-default somewhere else in your app
    plt.style.use(style) # changes to the specified style
    fig0 = Figure(figsize=(12, 6))
    ax0 = fig0.subplots()
    ax0.plot(x, y, linewidth=10.0, color=accent_color)
    ax0.set_title(f'Matplotlib Style: {style}');
    plt.style.use("default") # Resets to default style. Do this if you are styling matplotlib in multiple places in your app.
    return fig0


# Lets [bind](https://panel.holoviz.org/user_guide/APIs.html#reactive-functions) \`get_plot\` to the \`style\` widet and lay out the two in a \`Column\`.

# In[ ]:


get_plot=pn.bind(get_plot, style=style)
matplotlib_component = pn.Column(style,pn.panel(get_plot, height=500, sizing_mode="scale_width"))
matplotlib_component.servable()


# For more check out the [Matplotlib style sheets reference](https://matplotlib.org/stable/gallery/style_sheets/style_sheets_reference.html) and the alternative themes [dracula theme](https://draculatheme.com/matplotlib) and [gadfly](https://towardsdatascience.com/a-new-plot-theme-for-matplotlib-gadfly-2cffc745ff84).

# ## Style the app template

# In[ ]:


pn.state.template.param.update(accent_base_color=accent_color, header_background=accent_color)


# ## Serve the app

# You can serve the app via \`panel serve MatplotlibStyle.ipynb\` and find it at http://localhost:5006/MatplotlibStyle. You should add the \`--autoreload\` flag while developing for *hot reloading*.


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