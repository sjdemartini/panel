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

# In[ ]:


import panel as pn
pn.extension('vega', sizing_mode="stretch_width")


# This example demonstrates how to link Panel widgets to a Vega pane by editing the Vega spec using callbacks and triggering updates in the plot.

# In[ ]:


imdb = {
  "$schema": "https://vega.github.io/schema/vega-lite/v4.json",
  "data": {"url": "https://raw.githubusercontent.com/vega/vega/master/docs/data/movies.json"},
  "transform": [{
    "filter": {"and": [
      {"field": "IMDB Rating", "valid": True},
      {"field": "Rotten Tomatoes Rating", "valid": True}
    ]}
  }],
  "mark": "rect",
  "width": "container",
  "height": 400,
  "encoding": {
    "x": {
      "bin": {"maxbins":60},
      "field": "IMDB Rating",
      "type": "quantitative"
    },
    "y": {
      "bin": {"maxbins": 40},
      "field": "Rotten Tomatoes Rating",
      "type": "quantitative"
    },
    "color": {
      "aggregate": "count",
      "type": "quantitative"
    }
  },
  "config": {
    "view": {
      "stroke": "transparent"
    }
  }
}


# In[ ]:


vega = pn.pane.Vega(imdb, height=425)


# In[ ]:


# Declare range slider to adjust the color limits
color_lims = pn.widgets.RangeSlider(name='Color limits', start=0, end=125, value=(0, 40), step=1)
color_lims.jslink(vega, code={'value': """
target.data.encoding.color.scale = {domain: source.value};
target.properties.data.change.emit()
"""});


# In[ ]:


# Declare slider to control the number of bins along the x-axis
imdb_bins = pn.widgets.IntSlider(name='IMDB Ratings Bins', start=0, end=125, value=60, step=25)
imdb_bins.jslink(vega, code={'value': """
target.data.encoding.x.bin.maxbins = source.value;
target.properties.data.change.emit()
"""});


# In[ ]:


# Declare slider to control the number of bins along the y-axis
tomato_bins = pn.widgets.IntSlider(name='Rotten Tomato Ratings Bins', start=0, end=125, value=40, step=25)
tomato_bins.jslink(vega, code={'value': """
target.data.encoding.y.bin.maxbins = source.value;
target.properties.data.change.emit()
"""});


# In[ ]:


pn.Row(vega, pn.Column(color_lims, imdb_bins, tomato_bins, sizing_mode="fixed", width=400))


# ## App
# 
# Lets wrap it into nice template that can be served via \`panel serve vega_heatmap_link.ipynb\`

# In[ ]:


pn.template.FastListTemplate(
    site="Panel", title="Vega Heatmap w. JS Links", 
    sidebar=[color_lims, imdb_bins, tomato_bins],
    main=[
        pn.pane.Markdown("This example demonstrates how to link Panel widgets to a **Vega pane** by editing the Vega spec using **js callbacks** and triggering updates in the plot."), 
        vega
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