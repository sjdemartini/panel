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
  const env_spec = ['https://cdn.holoviz.org/panel/0.14.0/dist/wheels/bokeh-2.4.3-py3-none-any.whl', 'https://cdn.holoviz.org/panel/0.14.0/dist/wheels/panel-0.14.0-py3-none-any.whl', 'graphviz']
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


from graphviz import Graph
import panel as pn

pn.extension(sizing_mode="stretch_width")


# # Panel and GraphViz
# 
# The purpose of this example is to show how easy it is to use [GraphViz](https://graphviz.readthedocs.io/en/stable/manual.html#) with Panel.

# ## Creating a Graph with GraphViz
# 
# This section is independent of Panel. You can find a tutorial and examples in the [GraphViz Documentation](https://graphviz.readthedocs.io/en/stable/manual.html#).

# In[ ]:


def create_graph(word1="Hello", word2="world", node_color='#00aa41'):
    graphviz_graph = Graph(word1, format='svg', node_attr={'color': node_color, 'style': 'filled', "fontcolor": 'white'})
    graphviz_graph.attr(bgcolor='#A01346:pink', label='My Awesome Graph', fontcolor='white')
    graphviz_graph.edge(word1, word2)
    return graphviz_graph

create_graph()


# ## Making the Graph Interactive with Panel
# 
# Panel recognizes and shows GraphViz objects in the \`svg\` format out of the box.

# In[ ]:


word1 = pn.widgets.TextInput(value="Hello", name="Node 1")
word2 = pn.widgets.TextInput(value="World", name="Node 2")
node_color = pn.widgets.ColorPicker(value='#00aa41', name="Node Color")

create_graph = pn.bind(create_graph, word1=word1, word2=word2, node_color=node_color)

create_graph_component = pn.Row(pn.Spacer(), pn.panel(create_graph, width=105, sizing_mode="fixed"), pn.Spacer())

component = pn.Column(word1, word2, node_color, create_graph_component)
component


# ## Deploying it as an interactive App
# 
# You can serve the app with \`panel serve GraphViz.ipynb\` an find the live app at http://localhost:5006/GraphViz

# In[ ]:


pn.template.FastListTemplate(
    site="Panel",
    site_url="https://panel.holoviz.org/_static/logo_horizontal.png",
    title="Graphviz - Basic Example",
    main=[component],
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