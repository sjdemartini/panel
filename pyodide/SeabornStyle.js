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
  const env_spec = ['https://cdn.holoviz.org/panel/0.14.0/dist/wheels/bokeh-2.4.3-py3-none-any.whl', 'https://cdn.holoviz.org/panel/0.14.0/dist/wheels/panel-0.14.0-py3-none-any.whl', 'matplotlib', 'seaborn']
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


import seaborn as sns
import panel as pn
import matplotlib.font_manager

from matplotlib.figure import Figure

pn.extension(sizing_mode="stretch_width", template="fast")


# ## Styling Seaborn for Panel
# 
# In this example we will show how to style Seaborn charts with Panel for both the \`default\` and the \`dark\` theme.
# 
# ![SeabornStyle.gif](https://assets.holoviews.org/panel/thumbnails/gallery/styles/seaborn-styles.gif)

# ## Get or set the theme
# 
# When we use the Fast templates the \`theme\` can be found in the \`session_args\`.

# In[ ]:


def get_theme():
    return pn.state.session_args.get("theme", [b'default'])[0].decode()

theme = get_theme()
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


# ## Seaborn: \`set_theme\`
# 
# You can set the \`style\`, \`palette\` and \`font\` using \`sns.set_theme\`. See https://seaborn.pydata.org/generated/seaborn.set_theme.html.

# In[ ]:


def plot(style="white", palette="deep", font="sans-serif", theme="default", rc={}):
    sns.set_theme(style=style, palette=palette, font=font, rc=rc)
    
    fig = Figure(figsize=(12, 6))
    ax = fig.add_subplot(111)

    sns.barplot(x=["A", "B", "C"], y=[1, 3, 2], ax=ax)
    return fig


# Lets's add the Seaborn logo to the app

# In[ ]:


pn.Row(
    pn.layout.HSpacer(),
    pn.pane.SVG(
        "https://seaborn.pydata.org/_images/logo-tall-lightbg.svg",
        sizing_mode="fixed",
        width=210,
    ),
    pn.layout.HSpacer(),
).servable(target="sidebar")


# We can use [\`Select\`](https://panel.holoviz.org/reference/widgets/Select.html) widgets to explore the \`style\`, \`palette\` and \`font\` arguments

# In[ ]:


STYLES = [
    "dark",
    "ticks",
    "white",
    "whitegrid",
]
PALETTES = [
    "bright",
    "colorblind",
    "dark",
    "deep",
    "hls",
    "husl",
    "muted",
    "pastel",
    f"dark:{accent_color}",
    f"light:{accent_color}",
]
if theme == "dark":
    PALETTE = f"light:{accent_color}"
else:
    PALETTE = f"dark:{accent_color}"

FONTS = sorted(set([f.name for f in matplotlib.font_manager.fontManager.ttflist]))

if theme=="dark":
    RC = {
        "axes.labelcolor": "white",
        "axes.facecolor": "black",
        "figure.facecolor": "black",
        "xtick.color": "white",
        "ytick.color": "white",
    }
else:
    RC = {}


# In[ ]:


style = pn.widgets.Select(name="Style", value="white", options=STYLES).servable(target="sidebar")
palette = pn.widgets.Select(name="Palette", value=PALETTE, options=PALETTES).servable(
    target="sidebar"
)
font = pn.widgets.Select(name="Font", value="Verdana", options=FONTS).servable(target="sidebar")
pn.Column(style, palette, font)


# Lets define a plot

# We can *bind* the \`plot\`function to the widgets using \`pn.bind\`

# In[ ]:


interactive_plot = pn.bind(plot, style=style, palette=palette, font=font, theme=theme, rc=RC)
pn.panel(interactive_plot, sizing_mode="scale_width").servable()


# ## Style the app template

# In[ ]:


pn.state.template.param.update(
    site="Panel", title="Styling Seaborn", header_background=accent_color, accent_base_color=accent_color, favicon="https://raw.githubusercontent.com/mwaskom/seaborn/master/doc/_static/favicon.ico",
)


# ## Serve the app

# You can serve the app via \`panel serve SeabornStyle.ipynb\` and find it at http://localhost:5006/SeabornStyle. You should add the \`--autoreload\` flag while developing for *hot reloading*.


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