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
  const env_spec = ['https://cdn.holoviz.org/panel/0.14.0/dist/wheels/bokeh-2.4.3-py3-none-any.whl', 'https://cdn.holoviz.org/panel/0.14.0/dist/wheels/panel-0.14.0-py3-none-any.whl', 'altair', 'vega_datasets']
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


import altair as alt
import panel as pn

from vega_datasets import data


pn.extension("vega", sizing_mode="stretch_width", template="fast")


# ## Styling Vega and Altair for Panel
# 
# In this example we will show how to style Vega and Altair charts with Panel supporting the \`default\` and the \`dark\` theme.
# 
# ![VegaAltairStyle.gif](https://assets.holoviews.org/panel/thumbnails/gallery/styles/vega-styles.gif)

# ## Get or set the theme
# 
# When we use the Fast templates the theme will be available from the query args

# In[ ]:


def get_theme():
    return pn.state.session_args.get("theme", [b'default'])[0].decode()


# In[ ]:


theme=get_theme()
theme


# ## Select a nice accent color
# 
# Below we create some functionality to *cycle through* a list of nice accent colors.

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


# ## Vega and Vega-lite
# 
# You can configure the style of \`vega\` and \`vega-lite\` via the \`config\` key. Please note that only \`vega-lite\` supports responsive behaviour by setting \`width\` and \`height\` to \`container\`. \`vega\` requires the \`width\` and \`height\` to be integers.
# 
# See [Vega Themes](https://github.com/vega/vega-themes/) and the [Vega Themes Explorer App](https://vega.github.io/vega-themes) for more examples.

# In[ ]:


def get_vega_plot(theme="default", accent_color="blue"):
    vegalite = {
      "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
      "description": "A simple bar chart with rounded corners at the end of the bar.",
      "width": "container",
      "height": "container",
      "data": {
        "values": [
          {"a": "A", "b": 28},
          {"a": "B", "b": 55},
          {"a": "C", "b": 43},
          {"a": "D", "b": 91},
          {"a": "E", "b": 81},
          {"a": "F", "b": 53},
          {"a": "G", "b": 19},
          {"a": "H", "b": 87},
          {"a": "I", "b": 52}
        ]
      },
      "mark": {"type": "bar", "cornerRadiusEnd": 4, "tooltip": True},
      "encoding": {
        "x": {"field": "a", "type": "ordinal"},
        "y": {"field": "b", "type": "quantitative"},
        "color": {"value": accent_color},
      }
    }

    if theme == "dark":
        vegalite["config"] = {
            "background": "#333",
            "title": {"color": "#fff"},
            "style": {"guide-label": {"fill": "#fff"}, "guide-title": {"fill": "#fff"}},
            "axis": {"domainColor": "#fff", "gridColor": "#888", "tickColor": "#fff"},
        }
    return vegalite


# In[ ]:


vega_plot = get_vega_plot(theme=theme, accent_color=accent_color)
vega_pane = pn.pane.Vega(vega_plot, height=500, sizing_mode="stretch_both", name="VEGA")
vega_pane


# ## Altair
# 
# You can select the theme of Altair plots using [\`altair.themes.enable\`](https://altair-viz.github.io/user_guide/configuration.html#altair-themes) and the color using the \`configure_mark\` method.
# 
# For more details see the 
# 
# - [Altair Customization Guide](https://altair-viz.github.io/user_guide/customization.html#customizing-visualizations)
# - [Altair Themes Guide](https://altair-viz.github.io/user_guide/configuration.html#altair-themes)

# In[ ]:


def get_altair_plot(theme="default", accent_color="blue"):
    if theme == "dark":
        alt.themes.enable("dark")
    else:
        alt.themes.enable("default")
    return (
        alt.Chart(data.cars())
        .mark_circle(size=200)
        .encode(
            x='Horsepower:Q',
            y='Miles_per_Gallon:Q',
            tooltip=["Name", "Origin", "Horsepower", "Miles_per_Gallon"],
        )
        .configure_mark(
            color=accent_color
        )
        .properties(
            height="container",
            width="container",
        )
        .interactive()
    )


# In[ ]:


altair_plot = get_altair_plot(theme=theme, accent_color=accent_color)
altair_pane = pn.pane.Vega(altair_plot, height=500, sizing_mode="stretch_both", name="ALTAIR")
altair_pane


# ## Layout and style the app
# 
# Note how we mark this component \`.servable()\` so that it shows up in our data app.

# In[ ]:


pn.Tabs(vega_pane, altair_pane).servable(title="Panel - Vega/ Altair with custom styling")


# In[ ]:


pn.state.template.param.update(accent_base_color=accent_color, header_background=accent_color)


# ## Serve the app

# You can serve the app via \`panel serve VegaAltairStyle.ipynb\` and find it at http://localhost:5006/VegaAltairStyle. You should add the \`--autoreload\` flag while developing for *hot reloading*.


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