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
  const env_spec = ['https://cdn.holoviz.org/panel/0.14.0/dist/wheels/bokeh-2.4.3-py3-none-any.whl', 'https://cdn.holoviz.org/panel/0.14.0/dist/wheels/panel-0.14.0-py3-none-any.whl', 'altair', 'pandas']
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
import pandas as pd
import panel as pn

pn.extension('vega', template='fast')

pn.state.template.title = "Altair Brushing Example"


# This example demonstrates how to leverage the brushing/linked-selections support in the Vega pane to update a table.

# In[ ]:


df = pd.read_json("https://raw.githubusercontent.com/vega/vega/master/docs/data/penguins.json")

brush = alt.selection_interval(name='brush')  # selection of type "interval"

chart = alt.Chart(df).mark_point().encode(
    x=alt.X('Beak Length (mm):Q', scale=alt.Scale(zero=False)),
    y=alt.Y('Beak Depth (mm):Q', scale=alt.Scale(zero=False)),
    color=alt.condition(brush, 'Species:N', alt.value('lightgray'))
).properties(
    width=250,
    height=250
).add_selection(
    brush
)

vega_pane = pn.pane.Vega(chart, debounce=10)

def filtered_table(selection):
    if selection is None:
        return '## No selection'
    query = ' & '.join(
        f'{crange[0]:.3f} <= \`{col}\` <= {crange[1]:.3f}'
        for col, crange in selection.items()
    )
    return pn.pane.DataFrame(df.query(query), width=600)

pn.Column(
    'Select points on the plot and watch the linked table update.',
    sizing_mode='stretch_width'
).servable()

pn.Row(
    vega_pane,
    pn.Column(
        pn.bind(filtered_table, vega_pane.selection.param.brush),
        scroll=True, width=650, height=300
    )
).servable()



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