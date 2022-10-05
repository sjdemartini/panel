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

# Demonstrates loading deck.gl as external JSS and CSS components, rendering it as part of an app, and then linking it to Panel widgets.

# In[ ]:


import panel as pn

js_files = {'deck': 'https://cdn.jsdelivr.net/npm/deck.gl@8.1.12/dist.min.js',
            'mapboxgl': 'https://api.mapbox.com/mapbox-gl-js/v1.7.0/mapbox-gl.js'}
css_files = ['https://api.mapbox.com/mapbox-gl-js/v1.7.0/mapbox-gl.css']

pn.extension(js_files=js_files, css_files=css_files, sizing_mode="stretch_width")


# First, let's declare the cities we are interested in using Python:

# In[ ]:


cities = [
    {"city":"San Francisco","state":"California","latitude":37.7751,"longitude":-122.4193},
    {"city":"New York","state":"New York","latitude":40.6643,"longitude":-73.9385},
    {"city":"Los Angeles","state":"California","latitude":34.051597,"longitude":-118.244263},
    {"city":"London","state":"United Kingdom","latitude":51.5074,"longitude":-0.1278},
    {"city":"Hyderabad","state":"India","latitude":17.3850,"longitude":78.4867}]


# Next, let's declare an HTML \`<div>\` to render the plot into, then define the deck.gl script code to render a plot for those cities.

# In[ ]:


html = """
<div id="deckgl-container" style="height: 500px;width: 100p"></div>

<script type="text/javascript">
// Data
var CITIES = %s;
var deckgl = new deck.DeckGL({
  container: 'deckgl-container',
  mapboxApiAccessToken: 'pk.eyJ1IjoicGhpbGlwcGpmciIsImEiOiJjajM2bnE4MWcwMDNxMzNvMHMzcGV3NjlnIn0.976fZ1azCrTh50lEdZTpSg',
  initialViewState: {
      longitude: CITIES[0].longitude,
      latitude: CITIES[0].latitude,
      zoom: 10,
  },
  controller: true,
  layers: [
    new deck.ScatterplotLayer({
      data: CITIES,
      getPosition: d => [d.longitude, d.latitude],
      radiusMinPixels: 10
    })
  ],
});
</script>
""" % cities
deckgl = pn.pane.HTML(html, height=500)


# Next we can declare a Panel widget and define a \`\`jslink\`\` to update the deck.gl plot whenever the widget state changes. The example is adapted from https://deck.gl/gallery/viewport-transition but replaces D3 widgets with Panel-based widgets.

# In[ ]:


widget = pn.widgets.RadioButtonGroup(options=[c["city"] for c in cities])

update_city = """
var d = CITIES[source.active];
deckgl.setProps({
    initialViewState: {
        longitude: d.longitude,
        latitude: d.latitude,
        zoom: 10,
        transitionInterpolator: new deck.FlyToInterpolator({speed: 1.5}),
        transitionDuration: 'auto'
      }
});
"""

widget.jslink(deckgl, code={'active': update_city});

component = pn.Column(widget, deckgl)
component


# ## App
# 
# Lets wrap it into nice template that can be served via \`panel serve deckgl.ipynb\`

# In[ ]:


pn.template.FastListTemplate(site="Panel", title="Deck.gl", main=["This app **demonstrates loading deck.gl JSS and CSS components** and then linking it to Panel widgets.", component]).servable();



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