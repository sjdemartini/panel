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
  const env_spec = ['https://cdn.holoviz.org/panel/0.14.0/dist/wheels/bokeh-2.4.3-py3-none-any.whl', 'https://cdn.holoviz.org/panel/0.14.0/dist/wheels/panel-0.14.0-py3-none-any.whl', 'numpy', 'pyvista']
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
import numpy as np
import pyvista as pv
pn.extension('vtk', sizing_mode="stretch_width")


# Temporal function inspired from http://holoviews.org/user_guide/Live_Data.html

# In[ ]:


alpha = 2
xvals  = np.linspace(-4, 4,101)
yvals  = np.linspace(-4, 4,101)
xs, ys = np.meshgrid(xvals, yvals)

#temporal function to create data on a plane
def time_function(time):
    return np.sin(((ys/alpha)**alpha+time)*xs)

# 3d plane to support the data
mesh_ref = pv.UniformGrid(
    (xvals.size, yvals.size, 1), #dims
    (xvals[1]-xvals[0],yvals[1]-yvals[0],1), #spacing
    (xvals.min(),yvals.min(),0) #origin
)
mesh_ref.point_arrays.append(time_function(0).flatten(order='F'), 'scalars') #add data for time=0
pl_ref = pv.Plotter()
pl_ref.add_mesh(mesh_ref, cmap='rainbow')
pn.panel(pl_ref.ren_win)


# We will demonstrate how to warp the surface and plot a temporal animation

# In[ ]:


mesh_warped = mesh_ref.warp_by_scalar() # warp the mesh using data at time=0
#create the pyvista plotter
pl = pv.Plotter()
pl.add_mesh(mesh_warped, cmap='rainbow')

#initialize panel and widgets
camera = {
    'position': [13.443258285522461, 12.239550590515137, 12.731934547424316],
    'focalPoint': [0, 0, 0],
     'viewUp': [-0.41067028045654297, -0.40083757042884827, 0.8189500570297241]
}
vtkpan = pn.panel(pl.ren_win, orientation_widget=True, sizing_mode='stretch_both', camera=camera)
frame = pn.widgets.Player(value=0, start=0, end=50, interval=100, loop_policy="reflect", height=100)

@pn.depends(frame=frame.param.value)
def update_3d_warp(frame):
    #the player value range in between 0 and 50, howver we want time between 0 and 10
    time = frame/5
    data = time_function(time).flatten(order='F')
    mesh_ref.point_arrays.append(data, 'scalars')
    mesh_warped.point_arrays.append(data, 'scalars')
    mesh_warped.points = mesh_ref.warp_by_scalar(factor=0.5).points
    vtkpan.synchronize()

component = pn.Column(frame, vtkpan, update_3d_warp, height=600)
component


# ## App
# 
# Lets wrap it into nice template that can be served via \`panel serve VTKWarp.ipynb\`

# In[ ]:


pn.template.FastListTemplate(site="Panel", title="VTK Warp", main=["This app demonstrates the use of \`VTK\`", component]).servable();



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