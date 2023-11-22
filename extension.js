/*
    DashBar for GNOME Shell 45+
    (c) Francois Thirioux 2023
    Contributors: @fthx
    License GPL v3
*/


import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as AppFavorites from 'resource:///org/gnome/shell/ui/appFavorites.js';
import * as AppMenu from 'resource:///org/gnome/shell/ui/appMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as DND from 'resource:///org/gnome/shell/ui/dnd.js';

import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
const N_ = x => x;

const PLACES_ICON_NAME = 'folder-symbolic';
const APPGRID_ICON_NAME = 'view-app-grid-symbolic';
const APP_NORMAL_OPACITY = 216;
const APP_LOW_OPACITY = 132;


const TaskBar = GObject.registerClass(
class TaskBar extends PanelMenu.Button {
    _init() {
        super._init();

        this.set_track_hover(false);
        this.set_reactive(false);
        this.set_can_focus(false);

        this._box = new St.BoxLayout({style_class: 'panel-status-menu-box'});
        this._box.set_reactive(true);
        this.add_child(this._box);

        this._task_menu_manager = new PopupMenu.PopupMenuManager(this._box);
        this._task_menu = new AppMenu.AppMenu(this._box, St.Side.TOP, {
            favoritesSection: true,
            showSingleWindows: true,
        });
        this._task_menu_manager.addMenu(this._task_menu);
        Main.uiGroup.add_actor(this._task_menu.actor);
        this._task_menu.close();
    }

    _destroy() {
        if (this._task_menu && this._task_menu_manager) {
            Main.uiGroup.remove_actor(this._task_menu.actor);
            this._task_menu_manager.removeMenu(this._task_menu);
        }

        this._box.destroy_all_children();
        this._box.destroy();
        super.destroy();
    }
});

const TaskBarItem = GObject.registerClass(
class TaskBarItem extends St.Bin {
    _init() {
        super._init();

        this.set_track_hover(true);
        this.set_reactive(true);
        this.set_can_focus(true);
        this.set_style_class_name('app-notrunning');
        this.set_opacity(APP_NORMAL_OPACITY);

        this._delegate = this;
        this._draggable = DND.makeDraggable(this, {dragActorOpacity: APP_LOW_OPACITY});
        this._draggable.connectObject('drag-end', this._on_drag_end.bind(this), this);
        this._draggable.connectObject('drag-cancelled', this._on_drag_cancelled.bind(this), this);

        this._app_id = null;
    }

    _on_drag_end() {
        AppFavorites.getAppFavorites().emit('changed');
    }

    _on_drag_cancelled() {
        AppFavorites.getAppFavorites().emit('changed');
    }

    acceptDrop(source) {
        if (source && source._app_id) {
            this._index_in_favorites = AppFavorites.getAppFavorites()._getIds().indexOf(this._app_id);
            AppFavorites.getAppFavorites().moveFavoriteToPos(source._app_id, this._index_in_favorites);
        }
        return true;
    }
});

const AppGridButton = GObject.registerClass(
class AppGridButton extends PanelMenu.Button {
    _init() {
        super._init();

        this.set_track_hover(true);
        this.set_reactive(true);
        this.set_can_focus(true);

        this.add_child(new St.Icon({icon_name: APPGRID_ICON_NAME, style_class: 'system-status-icon'}));
        this.connectObject('button-release-event', this._activate.bind(this), this);
    }

    _activate(widget, event) {
        if (Main.overview.visible) {
            this._showapps_button_checked = Main.overview.dash.showAppsButton.checked;
            Main.overview.dash.showAppsButton.checked = !this._showapps_button_checked;
        } else {
            Main.overview.showApps();
        }
    }
});

export default class DashBarExtension extends Extension {
    constructor(metadata) {
        super(metadata);
    }

    _show_places_icon(show) {
        this._places_indicator = Main.panel.statusArea['places-menu'];
        if (this._places_indicator) {
            this._places_indicator.remove_child(this._places_indicator.get_first_child());
            if (show) {
                this._places_icon = new St.Icon({icon_name: PLACES_ICON_NAME, style_class: 'system-status-icon'});
                this._places_indicator.add_child(this._places_icon);
            } else {
                this._places_label = new St.Label({text: _('Places'), y_expand: true, y_align: Clutter.ActorAlign.CENTER});
                this._places_indicator.add_child(this._places_label);
            }
        }
    }

    _has_to_be_counted(window) {
        return [Meta.WindowType.NORMAL, Meta.WindowType.DIALOG].includes(window.get_window_type())
            && !window.is_override_redirect()
            && !window.is_attached_dialog();
    }

    _is_on_active_workspace(app) {
        return app.is_on_workspace(global.workspace_manager.get_active_workspace());
    }

    _on_taskbar_scroll(origin, event) {
        this._active_workspace = global.workspace_manager.get_active_workspace();
        switch(event.get_scroll_direction()) {
            case Clutter.ScrollDirection.DOWN:
            case Clutter.ScrollDirection.RIGHT:
                this._active_workspace.get_neighbor(Meta.MotionDirection.RIGHT).activate(event.get_time());
                break;
            case Clutter.ScrollDirection.UP:
            case Clutter.ScrollDirection.LEFT:
                this._active_workspace.get_neighbor(Meta.MotionDirection.LEFT).activate(event.get_time());
                break;
        }
    }

    _on_taskbar_button_hover(widget) {
        if (widget.get_hover()) {
            widget.ease({
                duration: 100,
                opacity: APP_LOW_OPACITY,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onComplete: () => {
                    widget.ease({
                        duration: 100,
                        opacity: APP_NORMAL_OPACITY,
                        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                    });
                },
            });
        }
    }

    _activate(widget, event, app) {
        if (event.get_button() == 1) {
            let app_windows = app.get_windows();
            if (app_windows[0] && app_windows.filter(this._has_to_be_counted).length > 1) {
                if (app_windows[0].has_focus()) {
                    app.activate_window(app_windows[app_windows.length - 1], global.get_current_time());
                } else {
                    app.activate();
                }
            } else {
                if (app_windows[0] && app_windows[0].has_focus() && app_windows[0].can_minimize() && !Main.overview.visible) {
                    app_windows[0].minimize();
                } else {
                    Main.overview.hide();
                    app.activate();
                }
            }
        }

        if (event.get_button() == 2) {
            Main.overview.hide();
            if (app.can_open_new_window()) {
                app.open_new_window(-1);
            }
        }

        if (event.get_button() == 3) {
            this._taskbar._task_menu_manager.removeMenu(this._taskbar._task_menu);
            this._taskbar._task_menu.sourceActor = widget;
            this._taskbar._task_menu._boxPointer.set_position(global.get_pointer()[0], Main.panel.get_height());
            this._taskbar._task_menu.setApp(app);
            this._taskbar._task_menu_manager.addMenu(this._taskbar._task_menu);
            this._taskbar._task_menu.open();
        }
    }

    _update_taskbar_items() {
        this._taskbar._box.destroy_all_children();
        Main.overview.dash._redisplay();

        this._dash_items = Main.overview.dash._dashContainer.get_first_child().get_children();
        this._dash_items.forEach(item => {
            if (item.child && item.child.app) {
                if (!this._show_only_running_apps || item.child.app.state == Shell.AppState.RUNNING) {
                    let app_id = item.child._id;
                    let app = item.child.app;

                    if (!this._show_only_active_workspace_apps || this._is_on_active_workspace(app)) {
                        let taskbar_button = new TaskBarItem();
                        taskbar_button._app = app;
                        taskbar_button._app_id = app_id;

                        let app_icon = app.create_icon_texture(this._app_icon_size);
                        taskbar_button.set_child(app_icon);
                        this._taskbar._box.add_child(taskbar_button);

                        taskbar_button.connectObject('button-release-event', (widget, event) => this._activate(widget, event, app), this);
                        taskbar_button.connectObject('notify::hover', (widget, event) => this._on_taskbar_button_hover(widget, event), this);
                    }
                }
            } else {
                if (!this._show_only_running_apps) {
                    let task_separator = new St.Label({y_align: Clutter.ActorAlign.CENTER, text: '|'});
                    this._taskbar._box.add_child(task_separator);
                }
            }
        });

        this._update_app_states();
    }

    _update_app_states() {
        this._taskbar._box.get_children().forEach(button => {
            if (button._app) {
                if (!this._show_only_running_apps) {
                    if (button._app.state == Shell.AppState.RUNNING && this._is_on_active_workspace(button._app)) {
                        button.set_style_class_name('app-running-on-current-workspace');
                    }
                    if (button._app.state == Shell.AppState.RUNNING && !this._is_on_active_workspace(button._app)) {
                        button.set_style_class_name('app-running-noton-current-workspace');
                    }
                    if (button._app.state != Shell.AppState.RUNNING) {
                        button.set_style_class_name('app-notrunning');
                    }
                } else {
                    if (this._window_tracker.focus_app == button._app) {
                        button.set_style_class_name('app-running-on-current-workspace');
                    } else {
                        button.set_style_class_name('app-notrunning');
                    }
                }
            }
        });
    }

    _on_settings_changed() {
        this._appgrid_button.visible = this._settings.get_boolean('show-appgrid');

        this._show_only_running_apps = this._settings.get_boolean('show-only-running-apps');
        this._show_only_active_workspace_apps = this._settings.get_boolean('show-only-active-workspace-apps');

        this._app_icon_size = this._settings.get_int('icon-size');

        this._update_taskbar_items();
    }

    _destroy_signals() {
            Main.layoutManager.disconnectObject(this);
            global.workspace_manager.disconnectObject(this);
            this._window_tracker.disconnectObject(this);
            this._app_system.disconnectObject(this);
            AppFavorites.getAppFavorites().disconnectObject(this);
            this._app_system.disconnectObject(this);
            Main.extensionManager.disconnectObject(this);
            this._settings.disconnectObject(this);
    }

    enable() {
        this._settings = this.getSettings();
        this._settings.connectObject('changed', this._on_settings_changed.bind(this), this);

        this._app_system = Shell.AppSystem.get_default();
        this._window_tracker = Shell.WindowTracker.get_default();

        this._appgrid_button = new AppGridButton();
        Main.panel.addToStatusArea("DashBar appgrid-button", this._appgrid_button, -1, 'left');

        this._taskbar = new TaskBar();
        Main.panel.addToStatusArea("DashBar taskbar", this._taskbar, -1, 'left');
        this._taskbar._box.connectObject('scroll-event', this._on_taskbar_scroll.bind(this), this);

        this._on_settings_changed();

        global.workspace_manager.connectObject('active-workspace-changed', this._update_taskbar_items.bind(this), this);
        this._window_tracker.connectObject('notify::focus-app', this._update_app_states.bind(this), this);
        this._app_system.connectObject('app-state-changed', this._update_taskbar_items.bind(this), this);
        this._app_system.connectObject('installed-changed', this._update_taskbar_items.bind(this), this);
        AppFavorites.getAppFavorites().connectObject('changed', this._update_taskbar_items.bind(this), this);

        this._show_places_icon(true);
        Main.extensionManager.connectObject('extension-state-changed', () => this._show_places_icon(true), this);

        Main.layoutManager.connectObject('startup-complete', () => {
            Main.overview.hide();
            this._show_places_icon(true);
            this._update_taskbar_items();
        });
    }

    disable() {
        this._appgrid_button.destroy();
        this._appgrid_button = null;

        this._taskbar._destroy();
        this._taskbar = null;

        this._destroy_signals();

        this._show_places_icon(false);

        this._settings = null;
    }
}
