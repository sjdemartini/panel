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
  const env_spec = ['https://cdn.holoviz.org/panel/0.14.0/dist/wheels/bokeh-2.4.3-py3-none-any.whl', 'https://cdn.holoviz.org/panel/0.14.0/dist/wheels/panel-0.14.0-py3-none-any.whl', 'numpy', 'pandas']
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

# # File Download Example
# 
# The **purpose** of this notebook is to provide code examples and **code snippets** that enable you to quickly add FileDownload to your Panel dashboard or application.

# In[ ]:


import numpy as np
import pandas as pd
import panel as pn
from io import BytesIO

pn.extension(sizing_mode="stretch_width")


# ## Source: Pandas DataFrame

# In[ ]:


data=pd.DataFrame(np.random.randn(100, 4), columns=list('ABCD'))


# ### Target: \`.csv\`

# In[ ]:


def get_csv():
    return BytesIO(data.to_csv().encode())

file_download_csv = pn.widgets.FileDownload(filename="data.csv", callback=get_csv, button_type="primary")
file_download_csv


# ### Target: \`.csv.zip\`

# In[ ]:


def get_csv_zip():
    output = BytesIO()
    output.name = "data.csv"
    data.to_csv(output, compression="zip")
    output.seek(0)
    return output

file_download_csv_zip = pn.widgets.FileDownload(filename="data.csv.zip", callback=get_csv_zip, button_type="primary")
file_download_csv_zip


# ### Target: \`.xlsx\`
# 
# Please note you need to install one of the packages
# 
# - [XlsxWriter](https://xlsxwriter.readthedocs.io/index.html) or
# - [OpenPyXL](https://openpyxl.readthedocs.io/en/stable/)
# 
# to be able to use the \`.to_excel\` method of a DataFrame.

# In[ ]:


def get_xlsx():
    output = BytesIO()
    writer = pd.ExcelWriter(output, engine='xlsxwriter')
    data.to_excel(writer, sheet_name="Data")
    writer.save() # Important!
    output.seek(0) # Important!
    return output

file_download_xlsx = pn.widgets.FileDownload(filename="data.xlsx", callback=get_xlsx, button_type="primary")
file_download_xlsx


# ### Target: \`.json\`

# In[ ]:


def get_json():
    return BytesIO(data.to_json(orient="records").encode())

file_download_json = pn.widgets.FileDownload(filename="data.json", callback=get_json, button_type="primary")
file_download_json


# ### Target: \`.parquet\`
# 
# Please note you need to have the \`pyarrow\` package installed for this to work.

# In[ ]:


def get_parquet():
    output = BytesIO()
    output.name = "data.parquet"
    data.to_parquet(output)
    output.seek(0)
    return output

file_download_parquet = pn.widgets.FileDownload(filename="data.parquet", callback=get_parquet, button_type="primary")
file_download_parquet


# ## Contributions
# 
# Example Contributions are very welcome. For example for \`DataFrame\` to \`html\` or \`pdf\`.

# ## App
# 
# Lets wrap it into nice template that can be served via \`panel serve file_download_examples.ipynb\`

# In[ ]:


pn.template.FastListTemplate(
    site="Panel", 
    title="File Download", 
    main=[
        "This app demonstrates how to **download a Pandas DataFrame** using different formats.",
        pn.Column(
            pn.pane.HTML("<div style='font-size: 100px;text-align: center'>🐼</div>", height=75, margin=(50,5,10,5)),
            file_download_csv, file_download_csv_zip, file_download_xlsx, file_download_json, file_download_parquet),
    ], main_max_width="768px",
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