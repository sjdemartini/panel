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
from vega_datasets import data
import panel as pn

pn.extension('vega', sizing_mode="stretch_width", template="fast")
pn.state.template.param.update(site="Panel", title="Altair Choropleth Maps")


# A simple example demonstrating how to use a reactive function depending on a single widget, to render Altair/Vega plots. In this case the \`Select\` widget allows selecting between various quantities that can be plotted on a choropleth map.

# In[ ]:


altair_logo = 'https://altair-viz.github.io/_static/altair-logo-light.png'
states = alt.topo_feature(data.us_10m.url, 'states')
states['url'] = 'https://raw.githubusercontent.com/vega/vega/master/docs/data/us-10m.json'
source = 'https://raw.githubusercontent.com/vega/vega/master/docs/data/population_engineers_hurricanes.csv'
variable_list = ['population', 'engineers', 'hurricanes']


# In[ ]:


def get_map(variable):
    return alt.Chart(states).mark_geoshape().encode(
        alt.Color(variable, type='quantitative')
    ).transform_lookup(
        lookup='id',
        from_=alt.LookupData(source, 'id', [variable])
    ).properties(
        width="container",
        height=300,
    ).project(
        type='albersUsa'
    ).repeat(
        row=[variable]
    )


# In[ ]:


logo = pn.panel(altair_logo, height=150, align="center", sizing_mode="fixed")
centered_logo = pn.Column(pn.layout.HSpacer(), logo, pn.layout.HSpacer()).servable(target="sidebar")
variable = pn.widgets.Select(options=variable_list, name='Variable', width=250).servable(target="sidebar")
info=pn.panel("A simple example demonstrating **how to use a *reactive function* depending on a single widget**, to render Altair plots.").servable()


# In[ ]:


def get_map_pane(variable):
    return pn.pane.Vega(get_map(variable), sizing_mode="stretch_width", margin=(10,100,10,5))

map_pane = pn.panel(pn.bind(get_map_pane, variable=variable)).servable()


# ## Explore the component in the notebook

# In[ ]:


pn.Row(
    pn.Column('# Altair Choropleth Maps', logo, variable, sizing_mode="fixed"),
    map_pane,
)


# ## Serve the App
# 
# You can serve the app via \`panel serve altair_chropleth.ipynb\`. Add \`--autoreload\` for hot reloading while developing.


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