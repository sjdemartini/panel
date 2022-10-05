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
  const env_spec = ['https://cdn.holoviz.org/panel/0.14.0/dist/wheels/bokeh-2.4.3-py3-none-any.whl', 'https://cdn.holoviz.org/panel/0.14.0/dist/wheels/panel-0.14.0-py3-none-any.whl', 'pandas', 'param', 'plotly']
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

# # Fileinput Exploration with Pandas and Plotly
# 
# In Panel the FileDownload widget allows downloading a file generated on the server the app is running on while the \`FileInput\` widget allows uploading a file. In this example we demonstrate a pipeline of two little apps one which allows generating a sample data CSV file and one which allows uploading this file and displays it as a Plotly plot. 
# 
# For more details on how to use these components see  [\`FileInput\`](../../reference/widgets/FileInput.ipynb) and [\`FileDownload\`](../../reference/widgets/FileDownload.ipynb) reference guides.

# In[ ]:


import io
import param
import panel as pn
import pandas as pd
import random

from datetime import datetime, timedelta

import plotly.express as px

pn.extension('plotly', 'tabulator', sizing_mode="stretch_width")


# Lets start out by creating some sample data by defining some parameters which declare bounds on the values to generate along with a [\`FileDownload\`](../../reference/widgets/FileDownload.ipynb) widget which will allow the user to download the data onto their machine.

# In[ ]:


class SampleDataApp(param.Parameterized):
    
    samples = param.Integer(default=40, bounds=(0,100), doc="""
      Number of data samples to generate.""")
    
    voltage_bounds=param.Range(default=(0,100), bounds=(0,1000), doc="""
      The bounds of the voltage values to generate.""")

    time_bounds=param.CalendarDateRange(
        default=(datetime(2020, 2, 1), datetime(2020, 2, 26)),
        bounds=(datetime(2020, 1, 1), datetime(2020, 3, 26)),
        doc="The bounds of the time values to generate.")
    
    fub_ids = param.ListSelector(
        default=["a1", "b1", "b2"], objects=["a1", "b1", "b2"], doc="""
      The IDS to generate.""")
    
    sample_df = param.DataFrame(doc="""
      The current dataframe of samples.""")
    
    generate_sample_df = param.Action(lambda self: self.update_sample_df(), label="Generate Data", doc="""
      An action callback which will update the sample_df.""")
    
    file_name = param.String(default="data.csv", doc="""
      The filename to save to.""")
        
    def __init__(self, **params):
        super().__init__(**params)
        self.update_sample_df()
        self.download = pn.widgets.FileDownload(
            name="Download Data", filename=self.file_name,
            callback=self._download_callback, button_type="primary"
        )
        self.table = pn.widgets.Tabulator(
            self.sample_df.head(10), layout='fit_data_stretch', theme='site', height=360
        )

    @pn.depends('file_name', watch=True)
    def _update_filename(self):
        self.download.filename = self.file_name

    def _download_callback(self):
        """
        A FileDownload callback will return a file-like object which can be serialized
        and sent to the client.
        """
        self.download.filename = self.file_name
        sio = io.StringIO()
        self.sample_df.to_csv(sio, index=False)
        sio.seek(0)
        return sio
        
    def update_sample_df(self, event=None):
        start = self.time_bounds[0]
        end = self.time_bounds[1]
        days = (end-start).days
        
        sample_data = {
            "Time": [start+timedelta(days=random.uniform(0,days)) for _ in range(0,self.samples)],
            "Voltage": [random.uniform(*self.voltage_bounds) for _ in range(0,self.samples)],
            "FubId": [random.choice(self.fub_ids) for _ in range(0,self.samples)],
        }
        self.sample_df = pd.DataFrame(sample_data) 
    
    @pn.depends("sample_df", watch=True)
    def _update_table(self):
        if hasattr(self, "table"):
            self.table.value = self.sample_df.head(10)
    
    def save_sample_data(self, event=None):
        if not self.sample_df is None:
            self.sample_df
            
    def view(self):
        return pn.Column(
            "## Generate and Download Data",
            pn.Row(
                pn.Param(self, parameters=['samples', 'voltage_bounds', 'time_bounds', 'generate_sample_df'], show_name=False, widgets={"generate_sample_df": {"button_type": "primary"}}),
                pn.Column(self.param.file_name, self.download, align='end', margin=(10,5,5,5)),
            ),
            "**Sample data (10 Rows)**",
            self.table,
        )

sample_data_app = SampleDataApp()
sample_data_app_view = sample_data_app.view()
sample_data_app_view


# **Click the \`Save sample df\` button**
# 
# This should save the dataframe to your default download folder. Now let us define the \`VoltageApp\` which will display the data we just generated.

# In[ ]:


class VoltageApp(param.Parameterized):
    data = param.DataFrame()
    
    file_input = param.Parameter()
    
    def __init__(self, **params):
        super().__init__(file_input=pn.widgets.FileInput(), **params)
        self.plotly_pane = pn.pane.Plotly(height=400, sizing_mode="stretch_width")

    @pn.depends("file_input.value", watch=True)
    def _parse_file_input(self):
        value = self.file_input.value
        if value:
            string_io = io.StringIO(value.decode("utf8"))
            self.data = pd.read_csv(string_io, parse_dates=["Time"])
        else:
            print("error")

    @pn.depends('data', watch=True)
    def get_plot(self):
        df = self.data
        if df is None:
            return
        assert ("Voltage" in df.columns) and ("Time" in df.columns), "no columns voltage and time"
        df = (df.loc[df['Voltage'] != 'Invalid/Calib']).copy(deep=True)
        df['Voltage'] = df['Voltage'].astype(float)
        if "FubId" in df.columns:
            p = px.scatter(df, x="Time", y="Voltage", color="FubId")
        else:
            p = px.scatter(df, x="Time", y="Voltage")
        self.plotly_pane.object = p
        
    def view(self):
        return pn.Column(
            "## Upload and Plot Data",
            self.file_input,
            self.plotly_pane,
        )
    
voltage_app = VoltageApp()

voltage_app_view = voltage_app.view()
voltage_app_view


# Now let us put these two components together into a servable app:

# In[ ]:


description = """
This application demonstrates the ability to **download** a file using the \`FileDownload\` widget 
and **upload** a file using the \`FileInput\` widget.
</br></br>
Try filtering the data, download the file by clicking on the Download button
and then plot it on the right by uploading that same file.
"""

component = pn.Column(
    description,
    sample_data_app_view,
    voltage_app_view,
    sizing_mode='stretch_both'
)
component


# ## App
# 
# Lets wrap it into nice template that can be served via \`panel serve download_upload_csv.ipynb\`

# In[ ]:


pn.template.FastListTemplate(site="Panel", title="Download and Upload CSV File", main=[ description, sample_data_app_view, voltage_app_view,]).servable();



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