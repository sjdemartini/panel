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
  const env_spec = ['https://cdn.holoviz.org/panel/0.14.0/dist/wheels/bokeh-2.4.3-py3-none-any.whl', 'https://cdn.holoviz.org/panel/0.14.0/dist/wheels/panel-0.14.0-py3-none-any.whl', 'holoviews>=1.15.1', 'hvplot', 'scikit-learn', 'pandas']
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
import hvplot.pandas

from sklearn.cluster import KMeans
from bokeh.sampledata import iris
pn.extension(sizing_mode="stretch_width")


# This app provides an example of building a simple dashboard using Panel. It demonstrates how to take the output of  k-means clustering on the Iris dataset (performed using scikit-learn), parameterizing the number of clusters and the x and y variables to plot. The entire clustering and plotting pipeline is expressed as a single reactive function that returns a plot that responsively updates when one of the widgets changes.

# In[ ]:


flowers = iris.flowers.copy()
cols = list(flowers.columns)[:-1]

x = pn.widgets.Select(name='x', options=cols)
y = pn.widgets.Select(name='y', options=cols, value='sepal_width')
n_clusters = pn.widgets.IntSlider(name='n_clusters', start=1, end=5, value=3)

@pn.depends(x.param.value, y.param.value, n_clusters.param.value)
def get_clusters(x, y, n_clusters):
    kmeans = KMeans(n_clusters=n_clusters)
    est = kmeans.fit(iris.flowers.iloc[:, :-1].values)
    flowers['labels'] = est.labels_.astype('str')
    centers = flowers.groupby('labels').mean()
    return (flowers.sort_values('labels').hvplot.scatter(x, y, c='labels', size=100, height=500) *
            centers.hvplot.scatter(x, y, marker='x', color='black', size=400,
                                   padding=0.1, line_width=5))

pn.Column(
    '# Iris K-Means Clustering',
    pn.Row(pn.WidgetBox(x, y, n_clusters), get_clusters)
)


# ## App
# 
# Lets wrap it into nice template that can be served via \`panel serve iris_kmeans.ipynb\`

# In[ ]:


pn.template.FastListTemplate(
    site="Panel", title="Iris Kmeans", 
    sidebar=[x, y, n_clusters],
    main=[
        "This app provides an example of **building a simple dashboard using Panel**.\\n\\nIt demonstrates how to take the output of **k-means clustering on the Iris dataset** using scikit-learn, parameterizing the number of clusters and the variables to plot.\\n\\nThe entire clustering and plotting pipeline is expressed as a **single reactive function** that responsively returns an updated plot when one of the widgets changes.\\n\\n The **\`x\` marks the center** of the cluster.""",
        get_clusters
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