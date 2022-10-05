import * as p from "@bokehjs/core/properties";
import { HTMLBox } from "@bokehjs/models/layouts/html_box";
import { PanelHTMLBoxView } from "./layout";
export declare class IPyWidgetView extends PanelHTMLBoxView {
    model: IPyWidget;
    private rendered;
    private ipyview;
    private manager;
    lazy_initialize(): Promise<void>;
    render(): void;
    has_finished(): boolean;
}
export declare namespace IPyWidget {
    type Attrs = p.AttrsOf<Props>;
    type Props = HTMLBox.Props & {
        bundle: p.Property<any>;
    };
}
export interface IPyWidget extends IPyWidget.Attrs {
}
export declare class IPyWidget extends HTMLBox {
    properties: IPyWidget.Props;
    constructor(attrs?: Partial<IPyWidget.Attrs>);
    static __module__: string;
    static init_IPyWidget(): void;
}
