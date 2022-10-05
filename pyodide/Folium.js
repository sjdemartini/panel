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
  const env_spec = ['https://cdn.holoviz.org/panel/0.14.0/dist/wheels/bokeh-2.4.3-py3-none-any.whl', 'https://cdn.holoviz.org/panel/0.14.0/dist/wheels/panel-0.14.0-py3-none-any.whl', 'folium', 'pandas', 'param']
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

# Demonstrates the use of [\`Folium\`](https://python-visualization.github.io/folium/) in Panel.

# In[ ]:


import folium as fm
import pandas as pd
import param
import panel as pn
import random
pn.extension(sizing_mode="stretch_width")


# You can use \`Folium\` in a Panel App

# In[ ]:


def get_map(lat=20.5936832, long=78.962883, zoom_start=5):
    return fm.Map(location=[lat,long], zoom_start=zoom_start)

map = get_map()

pn.panel(map, height=400)


# ## Interactive Panel app using Folium
# 
# Let build an interactive Panel application using Folium.
# 
# Lets **define some data**.

# In[ ]:


def get_df_aqi(lat_bounds=(10,30), long_bounds=(70,90), points_count=40):
    aqi = {
        "Latitude": [random.uniform(*lat_bounds) for _ in range(0,points_count)],
        "Longitude": [random.uniform(*long_bounds) for _ in range(0,points_count)],
        "AQI": [random.uniform(0,500) for _ in range(0,points_count)],
    }
    return pd.DataFrame(aqi)

df_aqi = get_df_aqi()
df_aqi.sample(5)


# Lets define some functionality to **add the data to the map** as circles

# In[ ]:


def add_aqi_circles(map, df_aqi):
    green_p1  = fm.map.FeatureGroup()
    yellow_p1 = fm.map.FeatureGroup()
    orange_p1 = fm.map.FeatureGroup()
    red_p1    = fm.map.FeatureGroup()
    purple_p1 = fm.map.FeatureGroup()
    maroon_p1 = fm.map.FeatureGroup()

    for _, row in df_aqi.iterrows():
        if row.AQI<50:
            feature_group = green_p1
            fill_color = "green"
        elif row.AQI < 100:
            feature_group = yellow_p1
            fill_color = "yellow"
        elif row.AQI < 150:
            feature_group = orange_p1
            fill_color = "orange"
        elif row.AQI < 200:
            feature_group = red_p1
            fill_color = "red"
        elif row.AQI < 300:
            feature_group = purple_p1
            fill_color='purple'
        else:
            feature_group = maroon_p1
            fill_color = "maroon"

        feature_group.add_child(
            fm.CircleMarker(
                [row.Latitude, row.Longitude],
                radius=10, 
                fill=True,
                fill_color=fill_color,
                fill_opacity=0.7
            )
        )

    map.add_child(green_p1)
    map.add_child(yellow_p1)
    map.add_child(orange_p1)
    map.add_child(red_p1)
    map.add_child(purple_p1)

add_aqi_circles(map, df_aqi)
pn.panel(map, height=400)


# Lets put it all together into an **interactive app** where the user can select the number of data points to generate and display.

# In[ ]:


class PanelFoliumMap(param.Parameterized):
    points_count = param.Integer(20, bounds=(10,100))
        
    def __init__(self, **params):
        super().__init__(**params)
        self.map = get_map()
        self.folium_pane = pn.pane.plot.Folium(sizing_mode="stretch_both", min_height=500, margin=0)    
        self.view = pn.Column(
            self.param.points_count,
            self.folium_pane,
            sizing_mode="stretch_both", height=500
        )
        self._update_map()

    @param.depends("points_count", watch=True)
    def _update_map(self):
        self.map = get_map()
        df_aqi = get_df_aqi(points_count=self.points_count)
        add_aqi_circles(self.map, df_aqi)
        self.folium_pane.object = self.map

        
app = PanelFoliumMap()
app.view


# ## App
# 
# Lets wrap it into nice template that can be served via \`panel serve Folium.ipynb\`

# In[ ]:


pn.template.FastListTemplate(site="Panel", title="Folium", main=["This app demonstrates **how to use Folium with Panel**.", PanelFoliumMap().view]).servable();



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