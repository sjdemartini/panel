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
  const env_spec = ['https://cdn.holoviz.org/panel/0.14.0/dist/wheels/bokeh-2.4.3-py3-none-any.whl', 'https://cdn.holoviz.org/panel/0.14.0/dist/wheels/panel-0.14.0-py3-none-any.whl', 'holoviews>=1.15.1', 'hvplot', 'pandas']
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
import pandas as pd
import hvplot.pandas
import time

pn.extension(sizing_mode="stretch_width")


# Defer loading of the data and populating the widgets until the page is rendered:

# In[ ]:


stocks_url = 'https://raw.githubusercontent.com/vega/datalib/master/test/data/stocks.csv'

select_ticker = pn.widgets.Select(name='Stock Ticker', width=250, sizing_mode="fixed")

def load_data():
    if 'stocks' not in pn.state.cache: 
        pn.state.cache['stocks'] = df = pd.read_csv(stocks_url, parse_dates=['date']).set_index('symbol')
    else:
        df = pn.state.cache['stocks']
    symbols = list(df.index.unique())
    select_ticker.options = symbols
    select_ticker.value = symbols[0]
    
pn.state.onload(load_data)


# If \`'stocks'\` is not yet in cache we show a spinner widget, otherwise let us plot the data:

# In[ ]:


@pn.depends(select_ticker)
def plot_ticker(ticker):
    if 'stocks' not in pn.state.cache or not ticker:
        return pn.indicators.LoadingSpinner(value=True)
    time.sleep(0.5)
    return pn.state.cache['stocks'].loc[ticker].hvplot.line('date', 'price', color="#C01754", line_width=6)

pn.Row(select_ticker, plot_ticker)


# ## App
# 
# Lets wrap it into nice template that can be served via \`panel serve defer_data_load.ipynb\`

# In[ ]:


pn.template.FastListTemplate(
    site="Panel", 
    title="Defer Data Load", 
    sidebar=[select_ticker], 
    main=[
        "This app demonstrates how to **defer the loading** of the data and population of the widgets until the page is rendered",
        plot_ticker,
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