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
  const env_spec = ['https://cdn.holoviz.org/panel/0.14.0/dist/wheels/bokeh-2.4.3-py3-none-any.whl', 'https://cdn.holoviz.org/panel/0.14.0/dist/wheels/panel-0.14.0-py3-none-any.whl', 'param']
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

from panel.reactive import ReactiveHTML

pn.extension()


# In[ ]:


class Canvas(ReactiveHTML):
    
    color = param.Color(default='#000000')
    
    line_width = param.Number(default=1, bounds=(0.1, 10))
    
    uri = param.String()

    _template = """
    <canvas 
      id="canvas"
      style="border: 1px solid"
      width="${model.width}"
      height="${model.height}"
      onmousedown="${script('start')}"
      onmousemove="${script('draw')}"
      onmouseup="${script('end')}"
    >
    </canvas>
    <button id="clear" onclick='${script("clear")}'>Clear</button>
    <button id="save" onclick='${script("save")}'>Save</button>
    """
    
    _scripts = {
        'render': """
          state.ctx = canvas.getContext("2d")
        """,
        'start': """
          state.start = event
          state.ctx.beginPath()
          state.ctx.moveTo(state.start.offsetX, state.start.offsetY)
        """,
        'draw': """
          if (state.start == null)
            return
          state.ctx.lineTo(event.offsetX, event.offsetY)
          state.ctx.stroke()
        """,
        'end': """
          delete state.start
        """,
        'clear': """
          state.ctx.clearRect(0, 0, canvas.width, canvas.height);
        """,
        'save': """
          data.uri = canvas.toDataURL();
        """,
        'line_width': """
          state.ctx.lineWidth = data.line_width;
        """,
        'color': """
          state.ctx.strokeStyle = data.color;
        """
    }


# ## Example

# In[ ]:


canvas = Canvas(width=400, height=400)

# We create a separate HTML element which syncs with the uri parameter of the Canvas
png_view = pn.pane.HTML(height=400)
canvas.jslink(png_view, code={'uri': "target.text = \`<img src='${source.uri}'></img>\`"})

pn.Column(
    '# Drag on canvas to draw\\n To export the drawing to a png click save.',
    pn.Row(
        canvas.controls(['color', 'line_width']),
        canvas,
        png_view
    )
)


# ## App
# 
# Let's wrap it into nice template that can be served via \`panel serve CanvasDraw.ipynb\`

# In[ ]:


description=pn.pane.Markdown("This example shows how to use the \`ReactiveHTML\` component to develop a **Drawable Canvas**.", sizing_mode="stretch_width")
pn.template.FastListTemplate(
    site="Panel", title="Canvas Draw", 
    sidebar=[canvas.controls(['color', 'line_width'])], 
    main=[description, pn.Row(canvas, png_view, height=460)]
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