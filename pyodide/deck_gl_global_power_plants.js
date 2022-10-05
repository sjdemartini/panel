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
  const env_spec = ['https://cdn.holoviz.org/panel/0.14.0/dist/wheels/bokeh-2.4.3-py3-none-any.whl', 'https://cdn.holoviz.org/panel/0.14.0/dist/wheels/panel-0.14.0-py3-none-any.whl', 'pandas', 'param', 'pydeck']
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
import pydeck as pdk
pn.extension('deckgl', sizing_mode="stretch_width")


# In order to use Deck.gl you need a MAP BOX Key which you can acquire for free for limited use at [mapbox.com](https://account.mapbox.com/access-tokens/).
# 
# Now we can define a JSON spec and pass it to the DeckGL pane along with the Mapbox key:

# ## Advanced Example Based on Global Power Plant Database
# 
# We will base this example on data from the [Global Power Plant Database](http://datasets.wri.org/dataset/540dcf46-f287-47ac-985d-269b04bea4c6/resource/c240ed2e-1190-4d7e-b1da-c66b72e08858/download/globalpowerplantdatabasev120).
# 
# We will create an interactive application to explore the location and types of power plants globally.

# In[ ]:


import param
import pandas as pd

POWER_PLANT_URL = (
    "https://raw.githubusercontent.com/MarcSkovMadsen/awesome-streamlit/master/"
    "gallery/global_power_plant_database/global_power_plant_database.csv"
)

MAPBOX_KEY = "pk.eyJ1IjoicGFuZWxvcmciLCJhIjoiY2s1enA3ejhyMWhmZjNobjM1NXhtbWRrMyJ9.B_frQsAVepGIe-HiOJeqvQ"

pp_data = pd.read_csv(POWER_PLANT_URL)
pp_data.head(1)


# Clean the data as PyDeck does not handle NA data well

# In[ ]:


pp_data.primary_fuel = pp_data.primary_fuel.fillna("NA")
pp_data.capacity_mw = pp_data.capacity_mw.fillna(1)


# ## Transform the data

# In[ ]:


FUEL_COLORS = {
    "Oil": "black",
    "Solar": "green",
    "Gas": "black",
    "Other": "gray",
    "Hydro": "blue",
    "Coal": "black",
    "Petcoke": "black",
    "Biomass": "green",
    "Waste": "green",
    "Cogeneration": "gray",
    "Storage": "orange",
    "Wind": "green",
}

COLORS_R = {"black": 0, "green": 0, "blue": 0, "orange": 255, "gray": 128}
COLORS_G = {"black": 0, "green": 128, "blue": 0, "orange": 165, "gray": 128}
COLORS_B = {"black": 0, "green": 0, "blue": 255, "orange": 0, "gray": 128}

pp_data["primary_fuel_color"] = pp_data.primary_fuel.map(FUEL_COLORS)
pp_data["primary_fuel_color"] = pp_data["primary_fuel_color"].fillna("gray")
pp_data["color_r"] = pp_data["primary_fuel_color"].map(COLORS_R)
pp_data["color_g"] = pp_data["primary_fuel_color"].map(COLORS_G)
pp_data["color_b"] = pp_data["primary_fuel_color"].map(COLORS_B)
pp_data["color_a"] = 140

# "name", "primary_fuel", "capacity_mw",
pp_data = pp_data[[
    "latitude","longitude", "name", "capacity_mw",
    "color_r","color_g","color_b","color_a",]
]
pp_data.head(1)


# ## Create the app
# 
# Here we create a parameterized class which creates a PyDeck plot in the constructor and connects it to some parameters.

# In[ ]:


class GlobalPowerPlantDatabaseApp(param.Parameterized):
    
    data = param.DataFrame(pp_data, precedence=-1)

    opacity = param.Number(default=0.8, step=0.05, bounds=(0, 1))
    
    pitch = param.Number(default=0, bounds=(0, 90))
    
    zoom = param.Integer(default=1, bounds=(1, 10))
    
    def __init__(self, **params):
        super(GlobalPowerPlantDatabaseApp, self).__init__(**params)
        self._view_state = pdk.ViewState(
            latitude=52.2323,
            longitude=-1.415,
            zoom=self.zoom,
            min_zoom=self.param.zoom.bounds[0],
            max_zoom=self.param.zoom.bounds[1],
        )
        self._scatter = pdk.Layer(
            "ScatterplotLayer",
            data=self.data,
            get_position=["longitude", "latitude"],
            get_fill_color="[color_r, color_g, color_b, color_a]",
            get_radius="capacity_mw*10",
            pickable=True,
            opacity=self.opacity,
            filled=True,
            wireframe=True,
        )
        self._deck = pdk.Deck(
            map_style="mapbox://styles/mapbox/light-v9",
            initial_view_state=self._view_state,
            layers=[self._scatter],
            tooltip=True,
            api_keys={'mapbox': MAPBOX_KEY},
        )
        self.pane = pn.pane.DeckGL(self._deck, sizing_mode="stretch_width", height=700)
        self.param.watch(self._update, ['data', 'opacity', 'pitch', 'zoom'])

    @pn.depends('pane.hover_state', 'data')
    def _info(self):
        index = self.pane.hover_state.get('index', -1)
        if index == -1:
            index = slice(0, 0)
        return self.data.iloc[index][['name', 'capacity_mw']]

    @pn.depends('pane.view_State', watch=True)
    def _update(self):
        state = self.pane.view_state
        self._view_state.longitude = state['longitude']
        self._view_state.latitude = state['latitude']   

    def _update(self, event):
        if event.name == 'data':
            self._scatter.data = self.data
        if event.name == 'opacity':
            self._scatter.opacity = self.opacity
        if event.name == 'zoom':
            self._view_state.zoom = self.zoom
        if event.name == 'pitch':
            self._view_state.pitch = self.pitch
        self.pane.param.trigger('object')
    
    def view(self):
        return pn.Row(pn.Column(self.param, pn.panel(self._info, height=200)), self.pane)

component = GlobalPowerPlantDatabaseApp()
component.view()


# ## App
# 
# Lets wrap it into nice template that can be served via \`panel serve deck_gl_global_power_plants.ipynb\`

# In[ ]:


pn.template.FastListTemplate(site="Panel", title="Global Power Plants", 
                             sidebar=[pn.Param(component, show_name=False)], 
                             main=[
                                 "The data is from the [Global Power Plant Database](http://datasets.wri.org/dataset/540dcf46-f287-47ac-985d-269b04bea4c6/resource/c240ed2e-1190-4d7e-b1da-c66b72e08858/download/globalpowerplantdatabasev120).",
                                 pn.Column(component.pane, pn.panel(component._info, height=100))
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