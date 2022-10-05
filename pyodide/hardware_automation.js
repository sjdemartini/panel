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
  const env_spec = ['https://cdn.holoviz.org/panel/0.14.0/dist/wheels/bokeh-2.4.3-py3-none-any.whl', 'https://cdn.holoviz.org/panel/0.14.0/dist/wheels/panel-0.14.0-py3-none-any.whl', 'holoviews>=1.15.1', 'numpy', 'pandas']
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


import pandas as pd
import panel as pn
import numpy as np
import holoviews as hv
from holoviews.streams import Buffer
from bokeh.models import Button, Slider, Spinner
import time
import asyncio

pn.extension(sizing_mode="stretch_width")


# This app provides a simple example of a graphical interface for scientific instrument control using Panel for layout/interaction and [Holoviews](http://holoviews.org) for buffering and plotting data from the instrument.
# 
# First we make a mock instrument for this standalone example. The non-mock version of this class would communicate with the instrument (via serial/USB or NI-VISA, etc.)

# In[ ]:


class FakeInstrument(object):
    def __init__(self, offset=0.0):
        self.offset = offset

    def set_offset(self, value):
        self.offset = value

    def read_data(self):
        return np.random.random() + self.offset

instrument = FakeInstrument()  # Instantiate your instrument


# Now set up the buffer and plot to handle the streaming data. You could get by without making a Pandas Dataframe, but it does a good job of writing to a csv file. See [Working with Streaming Data](http://holoviews.org/user_guide/Streaming_Data.html) in the Holoviews documentation for other options.
# 
# Here we're only plotting one line of data, so we can create the DynamicMap simply by passing it hv.Curve. The Curve function is going to assume we want to plot the "Temperature (°C)" column versus the "Time (s)" column and generate the plot accordingly. If we wanted some other behavior, or if we had another column in our dataset and wanted to plot two lines at once, we could instead use functools.partial or define our own function that uses hv.Curve to plot the lines the way we want.

# In[ ]:


def make_df(time_sec=0.0, temperature_degC=0.0):
    return pd.DataFrame({'Time (s)': time_sec, 'Temperature (°C)': temperature_degC}, index=[0])

example_df = pd.DataFrame(columns=make_df().columns)
buffer = Buffer(example_df, length=1000, index=False)
plot = hv.DynamicMap(hv.Curve, streams=[buffer]).opts(padding=0.1, height=600, xlim=(0, None), responsive=True)


# Next we make our GUI components.

# In[ ]:


LABEL_START = 'Start'
LABEL_STOP = 'Stop'
LABEL_CSV_START = "Save to csv"
LABEL_CSV_STOP = "Stop save"
CSV_FILENAME = 'tmp.csv'

button_startstop = Button(label=LABEL_START, button_type="primary")
button_csv = Button(label=LABEL_CSV_START, button_type="success")
offset = Slider(title='Offset', start=-10.0, end=10.0, value=0.0, step=0.1)
interval = Spinner(title="Interval (sec)", value=0.1, step=0.01)


# Now we define the functionality. As in the Holoviews documentation on [Working with Streaming Data](http://holoviews.org/user_guide/Streaming_Data.html), here we're using a coroutine to handle getting and plotting the data without blocking the GUI (although here we're using async/await rather than a decorator). This asychronous approach works fine if you are only trying to get data from your instrument once every ~50 ms or so. If you need to communicate with your instrument more frequently than that, then you'll want a separate thread (and maybe even separate hardware) to handle the communication, and you will want to update the plot with blocks of data points rather than with every individual point.

# In[ ]:


acquisition_task = None
save_to_csv = False

async def acquire_data(interval_sec=0.1):
    global save_to_csv
    t0 = time.time()
    while True:
        instrument.set_offset(offset.value)
        time_elapsed = time.time() - t0
        value = instrument.read_data()
        b = make_df(time_elapsed, value)
        buffer.send(b)

        if save_to_csv:
            b.to_csv(CSV_FILENAME, header=False, index=False, mode='a')

        time_spent_buffering = time.time() - t0 - time_elapsed
        if interval_sec > time_spent_buffering:
            await asyncio.sleep(interval_sec - time_spent_buffering)


def toggle_csv(*events):
    global save_to_csv
    if button_csv.label == LABEL_CSV_START:
        button_csv.label = LABEL_CSV_STOP
        example_df.to_csv(CSV_FILENAME, index=False)  # example_df is empty, so this just writes the header
        save_to_csv = True
    else:
        save_to_csv = False
        button_csv.label = LABEL_CSV_START


def start_stop(*events):
    global acquisition_task, save_to_csv
    if button_startstop.label == LABEL_START:
        button_startstop.label = LABEL_STOP
        buffer.clear()
        acquisition_task = asyncio.get_running_loop().create_task(acquire_data(interval_sec=interval.value))
    else:
        acquisition_task.cancel()
        button_startstop.label = LABEL_START
        if save_to_csv:
            toggle_csv()


button_startstop.on_click(start_stop)
button_csv.on_click(toggle_csv)


# Finally, layout the GUI and start it. To run this in a notebook, we are using the .show method on a Panel object to start a Bokeh server and open the GUI in a new browser window. See [Depolying Bokeh Apps](http://holoviews.org/user_guide/Deploying_Bokeh_Apps.html) for more info and other options.

# In[ ]:


hv.extension('bokeh')
hv.renderer('bokeh').theme = 'caliber'
controls = pn.WidgetBox('# Controls',
                        button_startstop,
                        button_csv,
                        interval,
                        offset,
                        )

pn.Row(plot, controls)


# ## App
# 
# Lets wrap it into nice template that can be served via \`panel serve hardware_automation.ipynb\`

# In[ ]:


pn.template.FastListTemplate(
    site="Panel", 
    title="Hardware Automation, IoT, Streaming and Async", 
    sidebar=[*controls], 
    main=[
        "This app provides a simple example of a graphical interface for **scientific instrument control** using Panel for layout/interaction and [Holoviews](http://holoviews.org) for buffering and plotting data from the instrument.",
        plot,
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