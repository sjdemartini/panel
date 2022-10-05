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
  const env_spec = ['https://cdn.holoviz.org/panel/0.14.0/dist/wheels/bokeh-2.4.3-py3-none-any.whl', 'https://cdn.holoviz.org/panel/0.14.0/dist/wheels/panel-0.14.0-py3-none-any.whl', 'numpy', 'pandas', 'param']
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
import pandas as pd
import panel as pn
import numpy as np

from panel.reactive import ReactiveHTML

CSS = ['https://unpkg.com/leaflet@1.7.1/dist/leaflet.css']

JS = {
    'leaflet': 'https://unpkg.com/leaflet@1.7.1/dist/leaflet.js',
    'heat': 'https://cdn.jsdelivr.net/npm/leaflet.heat@0.2.0/dist/leaflet-heat.min.js'
}

pn.extension(css_files=CSS, js_files=JS)


# In[ ]:


class LeafletHeatMap(ReactiveHTML):
    
    attribution = param.String(doc="Tile source attribution.")
    
    blur = param.Integer(default=18, bounds=(5, 50), doc="Amount of blur to apply to heatmap")
    
    center = param.XYCoordinates(default=(0, 0), doc="The center of the map.")
    
    data = param.DataFrame(doc="The heatmap data to plot, should have 'x', 'y' and 'value' columns.")
    
    tile_url = param.String(doc="Tile source URL with {x}, {y} and {z} parameter")
    
    min_alpha = param.Number(default=0.2, bounds=(0, 1), doc="Minimum alpha of the heatmap")
    
    radius = param.Integer(default=25, bounds=(5, 50), doc="The radius of heatmap values on the map")
    
    x = param.String(default='longitude', doc="Column in the data with longitude coordinates")
    
    y = param.String(default='latitude', doc="Column in the data with latitude coordinates")
    
    value = param.String(doc="Column in the data with the data values")
    
    zoom = param.Integer(default=13, bounds=(0, 21), doc="The plots zoom-level")

    _template = """
    <div id="map" style="width: 100%; height: 100%; position: absolute;"></div>
    """
    
    _scripts = {
        'get_data': """
            const records = []
            for (let i=0; i<data.data.index.length; i++)
                records.push([data.data[data.y][i], data.data[data.x][i], data.data[data.value][i]])
            return records
        """,
        'render': """
            state.map = L.map(map).setView(data.center, data.zoom);
            state.map.on('zoom', (e) => { data.zoom = state.map.getZoom() })            
            state.tileLayer = L.tileLayer(data.tile_url, {
                attribution: data.attribution,
                maxZoom: 21,
                tileSize: 512,
                zoomOffset: -1,
            }).addTo(state.map);
        """,
        'after_layout': """
           state.map.invalidateSize()
           state.heatLayer = L.heatLayer(self.get_data(), {blur: data.blur, radius: data.radius, max: 10, minOpacity: data.min_alpha}).addTo(state.map)
        """,
        'radius': "state.heatLayer.setOptions({radius: data.radius})",
        'blur': "state.heatLayer.setOptions({blur: data.blur})",
        'min_alpha': "state.heatLayer.setOptions({minOpacity: data.min_alpha})",
        'zoom': "state.map.setZoom(data.zoom)",
        'data': 'state.heatLayer.setLatLngs(self.get_data())'
    }
    
    __css__ = CSS
    
    __javascript__ = list(JS.values())


# ### Example

# In[ ]:


url="http://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_month.csv"
earthquakes = pd.read_csv(url)

heatmap = LeafletHeatMap(
    attribution='Map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    data=earthquakes[['longitude', 'latitude', 'mag']],
    min_height=500,
    tile_url='https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}.jpg',
    radius=30,
    sizing_mode='stretch_both',
    value='mag',
    zoom=2,
)

description=pn.pane.Markdown(f'## Earthquakes between {earthquakes.time.min()} and {earthquakes.time.max()}\\n\\n[Data Source]({url})', sizing_mode="stretch_width")

pn.Column(
    description,
    pn.Row(
        heatmap.controls(['blur', 'min_alpha', 'radius', 'zoom']),
        heatmap,
        sizing_mode='stretch_both'
    ),
    sizing_mode='stretch_both'
)


# ## App
# 
# Let's wrap it into nice template that can be served via \`panel serve LeafletHeatMap.ipynb\`

# In[ ]:


pn.template.FastListTemplate(
    site="Panel", title="Leaflet Heat Map", 
    sidebar=[heatmap.controls(['blur', 'min_alpha', 'radius', 'zoom'])], 
    main=[description, pn.Row(heatmap, sizing_mode="stretch_both")]
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