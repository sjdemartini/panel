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
  const env_spec = ['https://cdn.holoviz.org/panel/0.14.0/dist/wheels/bokeh-2.4.3-py3-none-any.whl', 'https://cdn.holoviz.org/panel/0.14.0/dist/wheels/panel-0.14.0-py3-none-any.whl', 'networkx']
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


import networkx as nx
import panel as pn

pn.extension(sizing_mode="stretch_width")


# # Panel and NetworkX
# 
# The purpose of this example is to show how easy it is to use [NetworkX](https://networkx.org/documentation/stable/index.html) with Panel. For this example to work you will need \`NetworkX>=2.5\` and \`pygraphviz\` installed.
# 
# If you want interactive NetworkX graphs we recommend using [HvPlot](https://hvplot.holoviz.org/index.html). See the [HvPlot NetworkX User Guide](https://hvplot.holoviz.org/user_guide/NetworkX.html).

# ## Creating a Graph with NetworkX
# 
# This section is independent of Panel. You can find a tutorial and examples in the [NetworkX Documentation](https://networkx.org/documentation/stable/index.html).
# 
# We create the graph via NetworkX. We transform the NetworkX graph to a SVG using pygraphviz.

# In[ ]:


def clean_svg(svg):
    """To display a SVG in Panel nicely we need to 
    
    - remove any html in front of the \`<svg\` tag. 
    - replace the fixed width and height
    - make the fill transparent
    """
    viewbox_start = svg.find("viewBox=")
    return '<svg height="100%"' + svg[viewbox_start:].replace('fill="white"','fill="transparent"')

def get_graph(nodes=5):
    graph = nx.complete_graph(nodes)
    pyviz_graph = nx.nx_agraph.to_agraph(graph)
    svg_graph = pyviz_graph.draw(prog='dot', format='svg').decode('utf-8')
    return clean_svg(svg_graph)

pn.pane.SVG(get_graph(), height=500)


# ## Making the Graph Interactive with Panel
# 
# Panel recognizes and shows clean \`svg\` images out of the box.

# In[ ]:


nodes=pn.widgets.IntSlider(value=5, start=2, end=7, name="Number of Nodes")
get_graph = pn.bind(get_graph, nodes=nodes)


# In[ ]:


create_graph_component = pn.Row(pn.Spacer(), pn.panel(get_graph, height=500), pn.Spacer())

component = pn.Column(nodes, create_graph_component, height=600)
component


# ## Deploying it as an interactive App
# 
# You can serve the app with \`panel serve NetworkX.ipynb\` and find the live app at http://localhost:5006/NetworkX

# In[ ]:


ACCENT_BASE_COLOR="#98b2d1"

pn.template.FastListTemplate(
    site="Panel",
    site_url="https://panel.holoviz.org/_static/logo_horizontal.png",
    title="NetworkX - Basic Example",
    main=[component], header_background=ACCENT_BASE_COLOR, accent_base_color=ACCENT_BASE_COLOR,
    theme_toggle=False,
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