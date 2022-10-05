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
  const env_spec = ['https://cdn.holoviz.org/panel/0.14.0/dist/wheels/bokeh-2.4.3-py3-none-any.whl', 'https://cdn.holoviz.org/panel/0.14.0/dist/wheels/panel-0.14.0-py3-none-any.whl', 'holoviews>=1.15.1', 'numpy', 'param', 'pyvista', 'scipy']
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


from functools import partial

import holoviews as hv
import numpy as np
import panel as pn
import param
import pyvista as pv

from holoviews.operation.datashader import rasterize
from bokeh.util.serialization import make_globally_unique_id
from pyvista import examples
from scipy.ndimage import zoom

css = '''
.custom-wbox > div.bk {
    padding-right: 10px;
}
.scrollable {
    overflow: auto !important;
}
'''
js_files = {'jquery': 'https://code.jquery.com/jquery-1.11.1.min.js',
            'goldenlayout': 'https://golden-layout.com/files/latest/js/goldenlayout.min.js'}
css_files = ['https://golden-layout.com/files/latest/css/goldenlayout-base.css',
             'https://golden-layout.com/files/latest/css/goldenlayout-dark-theme.css']

pn.extension('vtk', js_files=js_files, raw_css=[css], css_files=css_files)

hv.renderer('bokeh').theme = 'dark_minimal'
hv.opts.defaults(hv.opts.Image(responsive=True, tools=['hover']))


# ## Declare callbacks

# In[ ]:


class ImageSmoother(param.Parameterized):
    
    smooth_fun = param.Parameter(default=None)
    smooth_level = param.Integer(default=5, bounds=(1,10))
    order = param.Selector(default=1, objects=[1,2,3])
    
    def __init__(self, **params):
        super(ImageSmoother, self).__init__(**params)
        self._update_fun()

    @param.depends('order', 'smooth_level', watch=True)
    def _update_fun(self):
        self.smooth_fun = lambda x: zoom(x, zoom=self.smooth_level, order=self.order)

def update_camera_projection(*evts):
    volume.camera['parallelProjection'] = evts[0].new
    volume.param.trigger('camera')

def hook_reset_range(plot, elem, lbrt):
    bkplot = plot.handles['plot']
    x_range = lbrt[0], lbrt[2]
    y_range = lbrt[1], lbrt[3]
    old_x_range_reset = bkplot.x_range.reset_start, bkplot.x_range.reset_end
    old_y_range_reset = bkplot.y_range.reset_start, bkplot.y_range.reset_end  
    if x_range != old_x_range_reset or y_range != old_y_range_reset:
        bkplot.x_range.reset_start, bkplot.x_range.reset_end = x_range
        bkplot.x_range.start, bkplot.x_range.end = x_range
        bkplot.y_range.reset_start, bkplot.y_range.reset_end = y_range
        bkplot.y_range.start, bkplot.y_range.end = y_range
    
def image_slice(dims, array, lbrt, mapper, smooth_fun):
    array = np.asarray(array)
    low = mapper['low'] if mapper else array.min()
    high = mapper['high'] if mapper else array.max()
    cmap = mapper['palette'] if mapper else 'fire'
    img = hv.Image(smooth_fun(array), bounds=lbrt, kdims=dims, vdims='Intensity')
    reset_fun = partial(hook_reset_range, lbrt=lbrt)
    return img.opts(clim=(low, high), cmap=cmap, hooks=[reset_fun])


# ## Declare Panel

# In[ ]:


# Download datasets
head = examples.download_head()
brain = examples.download_brain()

dataset_selection = pn.widgets.Select(name='Dataset', value=head, options={'Head': head, 'Brain': brain})

volume = pn.pane.VTKVolume(
    dataset_selection.value, sizing_mode='stretch_both', height=400, 
    display_slices=True, orientation_widget=True, render_background="#222222",
    colormap='blue2cyan'
)

dataset_selection.link(target=volume, value='object')

volume_controls = volume.controls(jslink=False, parameters=[
    'render_background', 'display_volume', 'display_slices',
    'slice_i', 'slice_j', 'slice_k', 'rescale'
])

toggle_parallel_proj = pn.widgets.Toggle(name='Parallel Projection', value=False)

toggle_parallel_proj.param.watch(update_camera_projection, ['value'], onlychanged=True)

smoother = ImageSmoother()

@pn.depends(si=volume.param.slice_i, mapper=volume.param.mapper,
            smooth_fun=smoother.param.smooth_fun, vol=volume.param.object)
def image_slice_i(si, mapper, smooth_fun, vol):
    arr = vol.active_scalars.reshape(vol.dimensions, order='F')
    lbrt = vol.bounds[2], vol.bounds[4], vol.bounds[3], vol.bounds[5]
    return image_slice(['y','z'], arr[si,:,::-1].T, lbrt, mapper, smooth_fun)

@pn.depends(sj=volume.param.slice_j, mapper=volume.param.mapper,
            smooth_fun=smoother.param.smooth_fun, vol=volume.param.object)
def image_slice_j(sj, mapper, smooth_fun, vol):
    arr = vol.active_scalars.reshape(vol.dimensions, order='F')
    lbrt = vol.bounds[0], vol.bounds[4], vol.bounds[1], vol.bounds[5]
    return image_slice(['x','z'], arr[:,sj,::-1].T, lbrt, mapper, smooth_fun)

@pn.depends(sk=volume.param.slice_k, mapper=volume.param.mapper,
            smooth_fun=smoother.param.smooth_fun, vol=volume.param.object)
def image_slice_k(sk, mapper, smooth_fun, vol):
    arr = vol.active_scalars.reshape(vol.dimensions, order='F')
    lbrt = vol.bounds[0], vol.bounds[2], vol.bounds[1], vol.bounds[3]
    return image_slice(['x', 'y'], arr[:,::-1,sk].T, lbrt, mapper, smooth_fun)

dmap_i = rasterize(hv.DynamicMap(image_slice_i))
dmap_j = rasterize(hv.DynamicMap(image_slice_j))
dmap_k = rasterize(hv.DynamicMap(image_slice_k))

controller = pn.WidgetBox(
    pn.Column(dataset_selection, toggle_parallel_proj, *volume_controls[1:], sizing_mode='fixed'),
    pn.Param(smoother, parameters=['smooth_level', 'order']),
    pn.layout.VSpacer(),
    css_classes=['panel-widget-box', 'custom-wbox'], sizing_mode='stretch_height'
)


# ## Set up template

# In[ ]:


template = """
{%% extends base %%}
<!-- goes in body -->
{%% block contents %%}
{%% set context = '%s' %%}
{%% if context == 'notebook' %%}
    {%% set slicer_id = get_id() %%}
    <div id='{{slicer_id}}'></div>
{%% endif %%}

<script>
var config = {
    settings: {
        hasHeaders: true,
        constrainDragToContainer: true,
        reorderEnabled: true,
        selectionEnabled: false,
        popoutWholeStack: false,
        blockedPopoutsThrowError: true,
        closePopoutsOnUnload: true,
        showPopoutIcon: false,
        showMaximiseIcon: true,
        showCloseIcon: false
    },
    content: [{
        type: 'row',
        content:[
            {
                type: 'component',
                componentName: 'view',
                componentState: { model: '{{ embed(roots.controller) }}',
                                  title: 'Controls',
                                  width: 350,
                                  css_classes:['scrollable']},
                isClosable: false,
            },
            {
                type: 'column',
                content: [
                    {
                        type: 'row',
                        content:[
                            {
                                type: 'component',
                                componentName: 'view',
                                componentState: { model: '{{ embed(roots.scene3d) }}', title: '3D View'},
                                isClosable: false,
                            },
                            {
                                type: 'component',
                                componentName: 'view',
                                componentState: { model: '{{ embed(roots.slice_i) }}', title: 'Slice I'},
                                isClosable: false,
                            }
                        ]
                    },
                    {
                        type: 'row',
                        content:[
                            {
                                type: 'component',
                                componentName: 'view',
                                componentState: { model: '{{ embed(roots.slice_j) }}', title: 'Slice J'},
                                isClosable: false,
                            },
                            {
                                type: 'component',
                                componentName: 'view',
                                componentState: { model: '{{ embed(roots.slice_k) }}', title: 'Slice K'},
                                isClosable: false,
                            }
                        ]
                    }
                ]
            }
        ]
    }]
};

{%% if context == 'notebook' %%}
    var myLayout = new GoldenLayout( config, '#' + '{{slicer_id}}' );
    $('#' + '{{slicer_id}}').css({width: '100%%', height: '800px', margin: '0px'})
{%% else %%}
    var myLayout = new GoldenLayout( config );
{%% endif %%}

myLayout.registerComponent('view', function( container, componentState ){
    const {width, css_classes} = componentState
    if(width)
      container.on('open', () => container.setSize(width, container.height))
    if (css_classes)
      css_classes.map((item) => container.getElement().addClass(item))
    container.setTitle(componentState.title)
    container.getElement().html(componentState.model);
    container.on('resize', () => window.dispatchEvent(new Event('resize')))
});

myLayout.init();
</script>
{%% endblock %%}
"""


tmpl = pn.Template(template=(template % 'server'), nb_template=(template % 'notebook'))
tmpl.nb_template.globals['get_id'] = make_globally_unique_id

tmpl.add_panel('controller', controller)
tmpl.add_panel('scene3d', volume)
tmpl.add_panel('slice_i', pn.panel(dmap_i, sizing_mode='stretch_both'))
tmpl.add_panel('slice_j', pn.panel(dmap_j, sizing_mode='stretch_both'))
tmpl.add_panel('slice_k', pn.panel(dmap_k, sizing_mode='stretch_both'))

tmpl.servable(title='VTKSlicer')



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