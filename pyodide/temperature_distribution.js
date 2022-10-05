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
  const env_spec = ['https://cdn.holoviz.org/panel/0.14.0/dist/wheels/bokeh-2.4.3-py3-none-any.whl', 'https://cdn.holoviz.org/panel/0.14.0/dist/wheels/panel-0.14.0-py3-none-any.whl', 'holoviews>=1.15.1', 'holoviews>=1.15.1', 'hvplot', 'pandas']
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


import hvplot.pandas
import panel as pn
import holoviews as hv

from bokeh.sampledata.sea_surface_temperature import sea_surface_temperature

pn.extension(sizing_mode="stretch_width")


# This example demonstrates how to put widgets together to build a simple UI for exploring the distribution of sea surface temperatures, as follows:
# 
# - Declare the various widgets
# - Declare a function that is decorated with the \`pn.depends\` to express the dependencies on the widget values
# - Define a callback that pops up the bandwidth slider to control the kernel density estimate (if it has been enabled).

# In[ ]:


bins = pn.widgets.IntSlider(name='Number of bins', start=5, end=25, step=5, value=10)
kde = pn.widgets.Checkbox(name='Show density estimate')
observations = pn.widgets.Checkbox(name='Show individual observations')
bandwidth = pn.widgets.FloatSlider(name='KDE Bandwidth', start=0.1, end=1)

@pn.depends(bins.param.value, kde.param.value,
            observations.param.value, bandwidth.param.value)
def get_plot(bins, kde, obs, bw):
    plot = sea_surface_temperature.hvplot.hist(bins=bins, normed=True, xlabel='Temperature (C)', padding=0.1, color="#A01346")
    if kde:
        plot *= sea_surface_temperature.hvplot.kde().opts(bandwidth=bw, color="#A01346")
    if obs:
        plot *= hv.Spikes(sea_surface_temperature, 'temperature').opts(
            line_width=0.1, alpha=0.1, spike_length=0.14, color="#A01346")
    return plot

widgets = pn.WidgetBox(bins, observations, kde)

def add_bandwidth(event):
    if event.new:
        widgets.append(bandwidth)
    else:
        widgets.remove(bandwidth)

kde.param.watch(add_bandwidth, 'value')

pn.Row(widgets, get_plot)


# ## App
# 
# Lets wrap it into nice template that can be served via \`panel serve temperature_distribution.ipynb\`

# In[ ]:


description="""This example demonstrates how to put widgets together to build a simple UI for exploring the distribution of sea surface temperatures, as follows:

- Declare the various widgets
- Declare a function that is decorated with the \`pn.depends\` to express the dependencies on the widget values
- Define a callback that pops up the bandwidth slider to control the kernel density estimate (if it has been enabled)."""
pn.template.FastListTemplate(
    site="Panel", 
    title="Temperature Distribution",
    sidebar=[widgets],
    main=[description, get_plot], main_max_width="768px",
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