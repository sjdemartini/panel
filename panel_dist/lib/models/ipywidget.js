import { HTMLBox } from "@bokehjs/models/layouts/html_box";
import { PanelHTMLBoxView } from "./layout";
const Jupyter = window.Jupyter;
export class IPyWidgetView extends PanelHTMLBoxView {
    constructor() {
        super(...arguments);
        this.rendered = false;
    }
    async lazy_initialize() {
        await super.lazy_initialize();
        let manager;
        if ((Jupyter != null) && (Jupyter.notebook != null))
            manager = Jupyter.notebook.kernel.widget_manager;
        else if (window.PyViz.widget_manager != null)
            manager = window.PyViz.widget_manager;
        else {
            console.warn("Panel IPyWidget model could not find a WidgetManager");
            return;
        }
        this.manager = manager;
        const { spec, state } = this.model.bundle;
        const models = await manager.set_state(state);
        const model = models.find((item) => item.model_id == spec.model_id);
        if (model != null) {
            const view = await this.manager.create_view(model, { el: this.el });
            this.ipyview = view;
            if (view.children_views) {
                for (const child of view.children_views.views)
                    await child;
            }
        }
    }
    render() {
        super.render();
        if (this.ipyview != null) {
            this.el.appendChild(this.ipyview.el);
            if (!this.rendered)
                this.ipyview.trigger('displayed', this.ipyview);
        }
        this.rendered = true;
    }
    has_finished() {
        return this.rendered && super.has_finished();
    }
}
IPyWidgetView.__name__ = "IPyWidgetView";
export class IPyWidget extends HTMLBox {
    constructor(attrs) {
        super(attrs);
    }
    static init_IPyWidget() {
        this.prototype.default_view = IPyWidgetView;
        this.define(({ Any }) => ({
            bundle: [Any, {}],
        }));
    }
}
IPyWidget.__name__ = "IPyWidget";
IPyWidget.__module__ = "panel.models.ipywidget";
IPyWidget.init_IPyWidget();
//# sourceMappingURL=ipywidget.js.map