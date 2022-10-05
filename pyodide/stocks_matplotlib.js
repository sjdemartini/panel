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
  const env_spec = ['https://cdn.holoviz.org/panel/0.14.0/dist/wheels/bokeh-2.4.3-py3-none-any.whl', 'https://cdn.holoviz.org/panel/0.14.0/dist/wheels/panel-0.14.0-py3-none-any.whl', 'matplotlib', 'pandas', 'param']
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
from matplotlib.figure import Figure
# not needed for mpl >= 3.1
from matplotlib.backends.backend_agg import FigureCanvas

from bokeh.sampledata import stocks

pn.extension(template='fast-list')


# This example is meant to make it easy to compare and contrast the different APIs Panel provides to declare apps and dashboards. Specifically, it compares four different implementations of the same app using 1) the quick and easy \`\`interact\`\` function, 2) more flexible reactive functions, 3) declarative Param-based code, and 4) explicit callbacks.
# 
# Before comparing the different approaches, we will first declare some components of the app that will be shared, including the title of the app, a set of stock tickers, a function to return a dataframe given the stock \`\`ticker\`\` and the rolling mean \`\`window_size\`\`, and another function to return a plot given those same inputs:

# In[ ]:


title = '## Stock Explorer Matplotlib'

tickers = ['AAPL', 'FB', 'GOOG', 'IBM', 'MSFT']

def get_df(ticker, window_size):
    df = pd.DataFrame(getattr(stocks, ticker))
    df['date'] = pd.to_datetime(df.date)
    return df.set_index('date').rolling(window=window_size).mean().reset_index()

def get_plot(ticker, window_size):
    fig = Figure(figsize=(10, 6))
    ax = fig.subplots()
    FigureCanvas(fig)  # not needed for mpl >= 3.1
    df = get_df(ticker, window_size)
    df.plot.line('date', 'close', ax=ax)
    return fig


# ### Interact
# 
# In the \`\`interact\`\` model the widgets are automatically generated from the arguments to the function or by providing additional hints to the \`\`interact\`\` call. This is a very convenient way to generate a simple app, particularly when first exploring some data.  However, because widgets are created implicitly based on introspecting the code, it is difficult to see how to modify the behavior.  Also, to compose the different components in a custom way it is necessary to unpack the layout returned by the \`\`interact\`\` call, as we do here:

# In[ ]:


interact = pn.interact(get_plot, ticker=tickers, window_size=(1, 21, 5))

pn.Row(
    pn.Column(title, interact[0], sizing_mode="fixed", width=300),
    interact[1]
)


# ### Reactive
# 
# The reactive programming model is similar to the \`\`interact\`\` function but relies on the user (a) explicitly instantiating widgets, (b) declaring how those widgets relate to the function arguments (using the \`\`bind\`\` function), and (c) laying out the widgets and other components explicitly. In principle we could reuse the \`\`get_plot\`\` function from above here but for clarity we will repeat it:

# In[ ]:


ticker = pn.widgets.Select(name='Ticker', options=tickers)
window = pn.widgets.IntSlider(name='Window Size', value=6, start=1, end=21)

def get_plot(ticker, window_size):
    fig = Figure(figsize=(5, 3))
    ax = fig.subplots()
    FigureCanvas(fig)  # not needed for mpl >= 3.1
    df = get_df(ticker, window_size)
    df.plot.line('date', 'close', ax=ax)
    return fig

pn.Row(
    pn.Column(title, ticker, window, sizing_mode="fixed", width=300),
    pn.bind(get_plot, ticker, window)
)


# ### Parameterized class
# 
# Another approach expresses the app entirely as a single \`\`Parameterized\`\` class with parameters to declare the inputs, rather than explicit widgets. The parameters are independent of any GUI code, which can be important for maintaining large codebases, with parameters and functionality defined separately from any GUI or panel code. Once again the \`\`depends\`\` decorator is used to express the dependencies, but in this case the dependencies are expressed as strings referencing class parameters, not parameters of widgets. The parameters and the \`\`plot\`\` method can then be laid out independently, with Panel used only for this very last step.

# In[ ]:


import param

class StockExplorer(param.Parameterized):
    
    ticker = param.Selector(default='AAPL', objects=tickers)
    
    window_size = param.Integer(default=6, bounds=(1, 21))
    
    @param.depends('ticker', 'window_size')
    def plot(self):
        return get_plot(self.ticker, self.window_size)
    
explorer = StockExplorer()
pn.Row(pn.Column(explorer.param, sizing_mode="fixed", width=300), explorer.plot)


# ### Callbacks
# 
# The above approaches are all reactive in some way, triggering actions whenever manipulating a widget causes a parameter to change, without users writing code to trigger callbacks explicitly.  Explicit callbacks allow complete low-level control of precisely how the different components of the app are updated, but they can quickly become unmaintainable because the complexity increases dramatically as more callbacks are added. The approach works by defining callbacks using the \`\`.param.watch\`\` API that either update or replace the already rendered components when a watched parameter changes:

# In[ ]:


ticker = pn.widgets.Select(name='Ticker', options=['AAPL', 'FB', 'GOOG', 'IBM', 'MSFT'])
window = pn.widgets.IntSlider(name='Window', value=6, start=1, end=21)

row = pn.Row(
    pn.Column(title, ticker, window, sizing_mode="fixed", width=300),
    get_plot(ticker.options[0], window.value),
)

def update(event):
    row[1].object = get_plot(ticker.value, window.value)

ticker.param.watch(update, 'value')
window.param.watch(update, 'value')

row


# In practice, different projects will be suited to one or the other of these APIs, and most of Panel's functionality should be available from any API.

# ## App
# 
# This notebook may also be served as a standalone application by running it with \`panel serve stocks_matplotlib.ipynb\`. Above we enabled a custom \`template\`, in this section we will add components to the template with the \`.servable\` method:

# In[ ]:


ticker.servable(area='sidebar')
window.servable(area='sidebar')

pn.panel("""This example compares **four different implementations of the same app** using 

- the quick and easy \`\`interact\`\` function, 
- more flexible *reactive* functions,
- declarative *Param-based* code, and 
- explicit *callbacks*.""").servable()

pn.panel(pn.bind(get_plot, ticker, window)).servable(title='Matplotlib Stock Explorer');



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