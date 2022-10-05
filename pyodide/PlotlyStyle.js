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
  const env_spec = ['https://cdn.holoviz.org/panel/0.14.0/dist/wheels/bokeh-2.4.3-py3-none-any.whl', 'https://cdn.holoviz.org/panel/0.14.0/dist/wheels/panel-0.14.0-py3-none-any.whl', 'pandas', 'plotly']
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


import pandas as pd
import panel as pn

import plotly.express as px
import plotly.io as pio
import plotly.graph_objects as go

pn.extension("plotly", sizing_mode="stretch_width")


# ## Styling Plotly for Panel
# 
# In this example we will show how to style Plotly plots with Panel for both the \`default\` and the \`dark\` theme.
# 
# ![PlotlyStyle.gif](https://assets.holoviews.org/panel/thumbnails/gallery/styles/plotly-styles.gif)

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


# ## Plotly
# 
# Plotly provides a list of built in templates in \`plotly.io.templates\`. See the [Plotly Templates Guide](https://plotly.com/python/templates/).
# 
# Let's define a [\`Select\`](https://panel.holoviz.org/reference/widgets/Select.html) widget to explore the templates. We will set the default value to \`plotly\` or \`plotly_dark\` depending on the theme.

# In[ ]:


plotly_template = pn.widgets.Select(options=sorted(pio.templates))


# In[ ]:


if theme=="dark":
    plotly_template.value="plotly_dark"
else:
    plotly_template.value="plotly"


# ## Plotly Express
# 
# Plotly Express provides a \`template\` argument. Let's try to use it.

# In[ ]:


data = pd.DataFrame(
    [
        ("Monday", 7),
        ("Tuesday", 4),
        ("Wednesday", 9),
        ("Thursday", 4),
        ("Friday", 4),
        ("Saturday", 4),
        ("Sunay", 4),
    ],
    columns=["Day", "Orders"],
)


# In[ ]:


def get_express_plot(template=plotly_template.value, accent_color=accent_color):
    fig = px.line(
        data,
        x="Day",
        y="Orders",
        template=template,
        color_discrete_sequence=(accent_color,),
        title=f"Orders: '{template}' theme"
    )
    fig.update_traces(mode="lines+markers", marker=dict(size=10), line=dict(width=4))
    fig.layout.autosize = True
    return fig


# Let's [bind](https://panel.holoviz.org/user_guide/APIs.html#reactive-functions) \`get_express_plot\` to the \`plotly_template\` widget and lay out the two in a \`Column\`.

# In[ ]:


get_express_plot=pn.bind(get_express_plot, template=plotly_template)


# In[ ]:


express_plot=pn.pane.panel(get_express_plot, config={"responsive": True}, sizing_mode="stretch_both", name="EXPRESS")


# In[ ]:


pn.Column(plotly_template, express_plot, sizing_mode="stretch_both")


# ## Plotly Graph Objects Figure
# 
# You can set the theme of a Plotly Graph Objects Figure via the \`update_layout\` method.

# In[ ]:


z_data = pd.read_csv("https://raw.githubusercontent.com/plotly/datasets/master/api_docs/mt_bruno_elevation.csv")


# In[ ]:


def get_go_plot(template=plotly_template.value, accent_color=accent_color):
    figure = go.Figure(
        data=go.Surface(z=z_data.values),
        layout=go.Layout(
            title="Mt Bruno Elevation",
        ))
    figure.layout.autosize = True
    figure.update_layout(template=template, title="Mt Bruno Elevation: '%s' theme" % template)
    return figure


# Letss [bind](https://panel.holoviz.org/user_guide/APIs.html#reactive-functions) \`get_go_plot\` to the \`plotly_template\` widget and lay everything using \`Tabs\`and \`Column\`.

# In[ ]:


get_go_plot=pn.bind(get_go_plot, template=plotly_template)


# In[ ]:


go_plot=pn.pane.panel(get_go_plot, config={"responsive": True}, sizing_mode="stretch_both", name="GRAPH OBJECTS")


# In[ ]:


pn.Column(plotly_template, go_plot, min_height=600)


# ## Wrap it up in a nice template
# 
# Here we use the [\`FastGridTemplate\`](https://panel.holoviz.org/reference/templates/FastListTemplate.html#templates-gallery-fastgridtemplate)

# In[ ]:


template = pn.template.FastGridTemplate(
    site="Panel",
    title="Styling Plotly",
    sidebar=[plotly_template],
    accent_base_color=accent_color,
    header_background=accent_color,
    header_color=color,
    row_height=70, 
    save_layout=True, prevent_collision=True,
)


# In[ ]:


template.main[0:1,:]=plotly_template
template.main[1:10,0:6]=express_plot
template.main[1:10,6:12]=go_plot


# In[ ]:


template.servable();


# ## Serve the app

# You can serve the app via \`panel serve PlotlyStyle.ipynb\` and find it at http://localhost:5006/PlotlyStyle. You should add the \`--autoreload\` flag while developing for *hot reloading*.


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