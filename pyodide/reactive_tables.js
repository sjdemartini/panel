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
  const env_spec = ['https://cdn.holoviz.org/panel/0.14.0/dist/wheels/bokeh-2.4.3-py3-none-any.whl', 'https://cdn.holoviz.org/panel/0.14.0/dist/wheels/panel-0.14.0-py3-none-any.whl', 'param', 'pandas']
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


import param
import panel as pn

from bokeh.sampledata.iris import flowers
from bokeh.sampledata.autompg import autompg_clean
from bokeh.sampledata.population import data

pn.extension(sizing_mode="stretch_width")


# This example demonstrates Panel's reactive programming paradigm using the Param library to express parameters, plus methods with computation depending on those parameters. This pattern can be used to update the displayed views whenever a parameter value changes, without re-running computation unnecessarily.

# In[ ]:


class ReactiveTables(param.Parameterized):
    
    dataset = param.ObjectSelector(default='iris', objects=['iris', 'autompg', 'population'])
    
    rows = param.Integer(default=10, bounds=(0, 19))
    
    @param.depends('dataset')
    def data(self):
        if self.dataset == 'iris':
            return flowers
        elif self.dataset == 'autompg':
            return autompg_clean
        else:
            return data

    @param.depends('data')
    def summary(self):
        return self.data().describe()
    
    @param.depends('data', 'rows')
    def table(self):
        return self.data().iloc[:self.rows]
    
    def panel(self):
        return pn.Row(
            pn.Param(self, name="Settings", width=300, sizing_mode="fixed"),
            pn.Column("## Description", self.summary, "## Table", self.table),
            min_height=1000)
    
component = ReactiveTables().panel()
component


# ## App
# 
# Lets wrap it into nice template that can be served via \`panel serve reactive_tables.ipynb\`

# In[ ]:


pn.template.FastListTemplate(site="Panel", title="Reactive Data Tables", 
                             main=[
                                 "This example demonstrates [Panel's](https://panel.holoviz.org) reactive programming paradigm using the [Param](https://param.holoviz.org) library to express parameters, plus methods with computation depending on those parameters. \\n\\nThis pattern can be used to update the plots and tables whenever a parameter value changes, without re-running computations unnecessarily.",
                                 component 
                             ]).servable();



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