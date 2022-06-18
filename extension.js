/*
    DashBar for GNOME Shell 42+
    (c) Francois Thirioux 2022
    Contributors: @fthx
    License GPL v3
*/


const { Clutter, GObject, Meta, Shell, St } = imports.gi;

const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const AppFavorites = imports.ui.appFavorites;
const AppMenu = imports.ui.appMenu;
const PopupMenu = imports.ui.popupMenu;
const DND = imports.ui.dnd;

const Gettext = imports.gettext.domain('gnome-shell-extensions');
const _ = Gettext.gettext;
const N_ = x => x;

var PLACES_ICON_NAME = 'folder-symbolic';
var SHOW_DESKTOP_BUTTON_ICON_NAME = 'video-display-symbolic';
var SHOW_APPS_BUTTON_ICON_NAME = 'view-app-grid-symbolic';
var RUNNING_APP_OPACITY = 255;
var NOTRUNNING_APP_OPACITY = 124;
var ICON_SIZE = Main.panel.get_height() - 5;


var TaskBar = GObject.registerClass(
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
            this._task_menu.destroy();
        }

        this._box.destroy_all_children();
        this._box.destroy();
        super.destroy();
    }
});

var TaskBarItem = GObject.registerClass(
class TaskBarItem extends St.Bin {
    _init() {
        super._init();
        this.set_track_hover(true);
        this.set_reactive(true);
        this.set_can_focus(true);

        this._delegate = this;
        this._draggable = DND.makeDraggable(this, {dragActorOpacity: RUNNING_APP_OPACITY});
        this._draggable.connect('drag-end', this._on_drag_end.bind(this));
        this._draggable.connect('drag-cancelled', this._on_drag_cancelled.bind(this));

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

var ShowDesktopButton = GObject.registerClass(
class ShowDesktopButton extends PanelMenu.Button {
    _init() {
        super._init();
        this.set_track_hover(true);
        this.set_reactive(true);

        this.add_child(new St.Icon({icon_name: SHOW_DESKTOP_BUTTON_ICON_NAME, style_class: 'system-status-icon'}));
        this.connect('button-release-event', this._activate.bind(this));
    }

    _activate(widget, event) {
        if (event.get_button() == 1) {
            global.workspace_manager.get_active_workspace().list_windows().forEach(window => {
                if (window && window.can_minimize()) {
                    window.minimize();
                }
            });
        }

        if (event.get_button() == 2) {
            // nothing to do with middle click for now
        }

        if (event.get_button() == 3) {
            global.workspace_manager.get_active_workspace().list_windows().forEach(window => {
                if (window) {
                    window.activate(global.get_current_time());
                }
            });
        }
    }
});

var ShowAppsButton = GObject.registerClass(
class ShowAppsButton extends PanelMenu.Button {
    _init() {
        super._init();
        this.set_track_hover(true);
        this.set_reactive(true);

        this.add_child(new St.Icon({icon_name: SHOW_APPS_BUTTON_ICON_NAME, style_class: 'system-status-icon'}));
        this.connect('button-release-event', this._activate.bind(this));
    }

    _activate(widget, event) {
        if (event.get_button() == 1) {
            Main.overview.toggle();
        }

        if (event.get_button() == 2) {
            // nothing to do with middle click for now
        }

        if (event.get_button() == 3) {
            if (Main.overview.visible) {
                Main.overview.hide();
            } else {
                Main.overview.showApps();
            }
        }
    }
});

class Extension {
    constructor() {
    }

    _show_activities(show) {
        this._activities_button = Main.panel.statusArea['activities'];
        if (this._activities_button) {
            if (show && !Main.sessionMode.isLocked) {
                this._activities_button.container.show();
            } else {
                this._activities_button.container.hide();
            }
        }
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
        this.active_workspace = global.workspace_manager.get_active_workspace();
        switch(event.get_scroll_direction()) {
            case Clutter.ScrollDirection.DOWN:
            case Clutter.ScrollDirection.RIGHT:
                this.active_workspace.get_neighbor(Meta.MotionDirection.RIGHT).activate(event.get_time());
                break;
            case Clutter.ScrollDirection.UP:
            case Clutter.ScrollDirection.LEFT:
                this.active_workspace.get_neighbor(Meta.MotionDirection.LEFT).activate(event.get_time());
                break;
        }
    }

    _on_taskbar_button_hover(widget) {
        if (widget.get_hover()) {
            switch (widget.get_style_class_name()) {
                case 'app-running-focused':
                case 'app-running-unfocused':
                    widget.ease({
                        duration: 100,
                        opacity: NOTRUNNING_APP_OPACITY,
                        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                        onComplete: () => {
                            widget.ease({
                                duration: 100,
                                opacity: RUNNING_APP_OPACITY,
                                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                            });
                        },
                    });
                    break;
                case 'app-notrunning':
                    widget.ease({
                        duration: 200,
                        opacity: RUNNING_APP_OPACITY,
                        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                    });
                    break;
            }
        } else {
            this._update_taskbar();
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

        if (event.get_button() == 2 && app.can_open_new_window()) {
            Main.overview.hide();
            app.open_new_window(-1);
        }

        if (event.get_button() == 3) {
            this._taskbar._task_menu_manager.removeMenu(this._taskbar._task_menu);
            this._taskbar._task_menu.sourceActor = widget;
            this._taskbar._task_menu._boxPointer.set_position(global.get_pointer()[0], Main.panel.get_height());
            this._taskbar._task_menu.setApp(app);
            this._taskbar._task_menu_manager.addMenu(this._taskbar._task_menu);
            this._taskbar._task_menu.open();
        }

        this._update_taskbar();
    }

    _add_taskbar_items() {
        Main.overview.dash._redisplay();

        this._dash_items = Main.overview.dash._dashContainer.get_first_child().get_children();
        this._dash_items.forEach(item => {
            if (item.child && item.child.app) {
                let app_id = item.child._id;
                let app = item.child.app;
                let app_icon;

                let taskbar_button = new TaskBarItem();
                taskbar_button._app_id = app_id;

                app_icon = app.create_icon_texture(ICON_SIZE);
                taskbar_button.set_child(app_icon);

                if (app.state == Shell.AppState.STOPPED) {
                    taskbar_button.set_style_class_name('app-notrunning');
                    taskbar_button.set_opacity(NOTRUNNING_APP_OPACITY);
                } else {
                    if (app.get_windows() && app.get_windows().includes(global.display.get_focus_window())) {
                        taskbar_button.set_style_class_name('app-running-focused');
                    } else {
                        taskbar_button.set_style_class_name('app-running-unfocused');
                    }
                    taskbar_button.set_opacity(RUNNING_APP_OPACITY);
                }

                taskbar_button.connect('button-release-event', (widget, event) => this._activate(widget, event, app));
                taskbar_button.connect('notify::hover', (widget, event) => this._on_taskbar_button_hover(widget, event));

                this._taskbar._box.add_child(taskbar_button);
            } else {
                let task_separator = new St.Label({y_align: Clutter.ActorAlign.CENTER, text: '|'});
                this._taskbar._box.add_child(task_separator);
            }
        });
    }

    _update_taskbar() {
        if (this._taskbar_updating) return;
        this._taskbar_updating = true;

        this._taskbar._box.destroy_all_children();
        this._add_taskbar_items();

        this._taskbar_updating = false;
    }

    _destroy_signals() {
        if (this._startup_complete) {
            Main.layoutManager.disconnect(this._startup_complete);
            this._startup_complete = null;
        }
        if (this._windows_changed) {
            this._window_tracker.disconnect(this._windows_changed);
            this._windows_changed = null;
        }
        if (this._restacked) {
            global.display.disconnect(this._restacked);
            this._restacked = null;
        }
        if (this._favorites_changed) {
            AppFavorites.getAppFavorites().disconnect(this._favorites_changed);
            this._favorites_changed = null;
        }
        if (this._extensions_changed) {
            Main.extensionManager.disconnect(this._extensions_changed);
            this._extensions_changed = null;
        }
        if (this._installed_changed) {
            this._app_system.disconnect(this._installed_changed);
            this._installed_changed = null;
        }
        if (this._app_state_changed) {
            this._app_system.disconnect(this._app_state_changed);
            this._app_state_changed = null;
        }
    }

    enable() {
        this._app_system = Shell.AppSystem.get_default();
        this._window_tracker = Shell.WindowTracker.get_default();

        this._show_desktop_button = new ShowDesktopButton();
        Main.panel.addToStatusArea("DashBar show-desktop-button", this._show_desktop_button, -1, 'left');

        this._show_apps_button = new ShowAppsButton();
        Main.panel.addToStatusArea("DashBar show-app-button", this._show_apps_button, -1, 'left');

        this._taskbar = new TaskBar();
        this._update_taskbar();
        Main.panel.addToStatusArea("DashBar taskbar", this._taskbar, -1, 'left');
        this._taskbar._box.connect('scroll-event', this._on_taskbar_scroll.bind(this));

        this._windows_changed = this._window_tracker.connect('tracked-windows-changed', this._update_taskbar.bind(this));
        this._restacked = global.display.connect('restacked', this._update_taskbar.bind(this));
        this._app_state_changed = this._app_system.connect('app-state-changed', this._update_taskbar.bind(this));
        this._favorites_changed = AppFavorites.getAppFavorites().connect('changed', this._update_taskbar.bind(this));
        this._installed_changed = this._app_system.connect('installed-changed', this._update_taskbar.bind(this));

        Main.panel.statusArea.appMenu.container.hide();
        this._show_activities(false);
        this._show_places_icon(true);
        this._extensions_changed = Main.extensionManager.connect('extension-state-changed', () => this._show_places_icon(true));

        this._startup_complete = Main.layoutManager.connect('startup-complete', () => {
            Main.overview.hide();
            this._show_activities(false);
            this._show_places_icon(true);
            this._update_taskbar();
        });
    }

    disable() {
        this._show_desktop_button.destroy();
        this._show_desktop_button = null;

        this._show_apps_button.destroy();
        this._show_apps_button = null;

        this._taskbar._destroy();
        this._taskbar = null;

        this._destroy_signals();

        if (!Main.overview.visible && !Main.sessionMode.isLocked) {
            Main.panel.statusArea.appMenu.container.show();
        }
        this._show_activities(true);
        this._show_places_icon(false);
    }
}

function init() {
    return new Extension();
}
