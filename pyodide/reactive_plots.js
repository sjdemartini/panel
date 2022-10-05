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
  const env_spec = ['https://cdn.holoviz.org/panel/0.14.0/dist/wheels/bokeh-2.4.3-py3-none-any.whl', 'https://cdn.holoviz.org/panel/0.14.0/dist/wheels/panel-0.14.0-py3-none-any.whl', 'holoviews>=1.15.1', 'hvplot', 'param', 'pandas']
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

# The [iris dataset](https://en.wikipedia.org/wiki/Iris_flower_data_set) is a standard example used to illustrate machine-learning and visualization techniques. Here, we show how to use [Panel](http://panel.pyviz.org) to create a dashboard for visualizing the dataset. The Panel dashboard uses [hvPlot](http://hvplot.pyviz.org) to create plots and [Param](https://param.pyviz.org) objects to create options for selecting the \`X\` and \`Y\` axis for the plot. First, let's import the packages we are using:

# In[ ]:


import hvplot.pandas
import param
import panel as pn

from bokeh.sampledata.iris import flowers

pn.extension(sizing_mode="stretch_width")


# The \`flowers\` dataset we imported from Bokeh has five columns: \`sepal_length\`, \`sepal_width\`, \`petal_length\`, \`petal width\`, and \`species\`.

# In[ ]:


flowers.head(2)


# We will start by using the dataframe with these five features and then create a \`Selector\` object to develop menu options for different input features. Later we will define the core plotting function in a \`plot\` method and define the layout in the \`panel\` method of the \`IrisDashboard\` class.
# 
# The \`plot\` method watches the \`X_variable\` and \`Y_variable\` using the \`param.depends\` [decorator](https://www.google.com/search?q=python+decorator), setting the \`watch\` option of this decorator to \`True\`. The \`plot\` method plots the features selected for \`X_variable\` and \`Y_variable\`  and colors them using the \`species\` column.

# In[ ]:


inputs = ['sepal_length', 'sepal_width', 'petal_length', 'petal_width']
    
class IrisDashboard(param.Parameterized):
    X_variable = param.Selector(inputs, default=inputs[0])
    Y_variable = param.Selector(inputs, default=inputs[1])
    
    @param.depends('X_variable', 'Y_variable')
    def plot(self):
        return flowers.hvplot.scatter(x=self.X_variable, y=self.Y_variable, by='species').opts(height=600)
    
    def panel(self):
        return pn.Row(
            pn.Param(self, width=300, name = "Plot Settings", sizing_mode="fixed"), 
            self.plot
        )

dashboard = IrisDashboard(name='Iris_Dashboard')


# And now you can explore how each of the input columns relate to each other, either here in the notebook or when served as a separate dashboard using \`panel serve --show Iris_dataset.ipynb\`:

# In[ ]:


component = dashboard.panel()
component


# ## App
# 
# Lets wrap it into nice template that can be served via \`panel serve reactive_plots.ipynb\`

# In[ ]:


pn.template.FastListTemplate(site="Panel", title="Machine Learning Data Visualization", 
                             main=[
                                 "The [iris dataset](https://en.wikipedia.org/wiki/Iris_flower_data_set) is a standard example used to illustrate **machine-learning and visualization techniques**.\\n\\nHere, we show how to use [Panel](http://panel.pyviz.org) to create a dashboard for visualizing the dataset. The Panel dashboard uses [hvPlot](http://hvplot.pyviz.org) to create plots and [Param](https://param.pyviz.org) objects to create options for selecting the \`X\` and \`Y\` axis for the plot.",
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