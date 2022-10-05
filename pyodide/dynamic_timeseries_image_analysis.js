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
  const env_spec = ['https://cdn.holoviz.org/panel/0.14.0/dist/wheels/bokeh-2.4.3-py3-none-any.whl', 'https://cdn.holoviz.org/panel/0.14.0/dist/wheels/panel-0.14.0-py3-none-any.whl', 'holoviews>=1.15.1', 'holoviews>=1.15.1', 'hvplot', 'numpy', 'pandas']
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

# [<img src="http://holoviews.org/_static/logo.png" style="height:50px;display:inline"></img>](https://holoviews.holoviz.org)[<img src="https://panel.holoviz.org/_static/logo_stacked.png" style="height:50px;display:inline"></img>](https://panel.holoviz.org)
# 
# # Timeseries Image Analysis with HoloViews and Panel 
# 
# The purpose of this notebook is to illustrate how you can **make an interactive and responsive tool for timeseries analysis of images** by combining a Panel \`IntSlider\`, some \`@pn.depends\` annotated plotting functions and a few HoloViews \`DynamicMap\`.

# ## Dependencies

# In[ ]:


import numpy as np
import pandas as pd
import holoviews as hv
import hvplot.pandas
import panel as pn

hv.extension('bokeh')
pn.extension(sizing_mode="stretch_width")


# ## Data

# In[ ]:


def make_ts_data(n_timesteps):
    data = pd.DataFrame(
        {
            "a": np.random.normal(size=(n_timesteps,)),
            "b": np.random.normal(size=(n_timesteps,)),
            "c": np.random.normal(size=(n_timesteps,)),
        },
        index=pd.Index(np.arange(n_timesteps), name="time", )
    )
    return data

ts_data = make_ts_data(1000)
ts_data.head()


# ## Plots

# In[ ]:


HEIGHT=300


# In[ ]:


plot_a = ts_data.hvplot(y="a", responsive=True, height=HEIGHT)
plot_b = ts_data.hvplot(y="b", responsive=True, height=HEIGHT)
plot_c = ts_data.hvplot(y="c", responsive=True, height=HEIGHT)

plot_a + plot_b + plot_c


# In[ ]:


def get_image(frame):
    return hv.Image(np.random.normal(size=(100, 100))).opts(height=HEIGHT, responsive=True)

get_image(100)


# In[ ]:


def get_vline(frame):
    return hv.VLine(frame).opts(color="red")

get_vline(0.5)


# ## App
# 
# ### Bar

# In[ ]:


app_bar = pn.Row(
    pn.pane.Markdown("## TimeSeries Image Analysis - POC", style={"color": "white"}, width=500, sizing_mode="fixed", margin=(10,5,10,15)), 
    pn.Spacer(),
    pn.pane.PNG("http://holoviews.org/_static/logo.png", height=50, sizing_mode="fixed", align="center"),
    pn.pane.PNG("https://panel.holoviz.org/_static/logo_horizontal.png", height=50, sizing_mode="fixed", align="center"),
    background="black",
)
app_bar


# ### Dynamic Plots

# In[ ]:


frame_slider = pn.widgets.IntSlider(name="Time", value=25, start=0, end=999)

@pn.depends(frame=frame_slider)
def image(frame):
    return get_image(frame)

@pn.depends(frame=frame_slider)
def vline(frame):
    return get_vline(frame)

vline_dmap = hv.DynamicMap(vline)
img_dmap = hv.DynamicMap(image)

plots = ((plot_a + plot_b + plot_c) * vline_dmap).cols(1)


# ### Layout

# In[ ]:


app = pn.Column(
    app_bar,
    pn.Spacer(height=10),
    frame_slider,
    pn.Row(
        plots,
        pn.Column(
            pn.Spacer(height=20),
            img_dmap,
        ),
    ),
)
app


# You are now ready to serve the app to your users via \`panel serve dynamic_timeseries_image_analysis.ipynb\`

# ### Notes
# 
# The \`plots = ((plot_a + plot_b + plot_c) * vline_dmap).cols(1)\` line is essential for making the app fast and responsive. Initially the \`plot_a + plot_b + plot_c\` where regenerated together with the \`vline\` everytime the \`frame_slider.value\` was changed. That made the app slower because it had to recalculate and retransfer much more data.

# ## App
# 
# Lets wrap it into nice template that can be served via \`panel serve dynamic_timeseries_image_analysis.ipynb\`

# In[ ]:


pn.template.FastListTemplate(
    site="Panel", title="Dynamic Timeseries Image Analysis", 
    main=[
        "The purpose of this app is to illustrate how you can **make an interactive and responsive tool for timeseries analysis of images** by combining a Panel \`IntSlider\`, some \`@pn.depends\` annotated plotting functions and a few HoloViews \`DynamicMap\`.",
        *app[2:]]
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