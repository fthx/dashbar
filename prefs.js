import Gio from 'gi://Gio';
import Adw from 'gi://Adw';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';


export default class DashBarExtensionPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        window._settings = this.getSettings();

        const page = new Adw.PreferencesPage({
            title: 'DashBar task bar extension',
            icon_name: 'dialog-information-symbolic',
        });
        window.add(page);

        const group = new Adw.PreferencesGroup({
            title: 'Settings',
        });
        page.add(group);

        const row_show_appgrid = new Adw.SwitchRow({
            title: 'Show app grid',
        });
        group.add(row_show_appgrid);
        window._settings.bind('show-appgrid', row_show_appgrid, 'active', Gio.SettingsBindFlags.DEFAULT);

        const row_show_only_running_apps = new Adw.SwitchRow({
            title: 'Show only running apps',
        });
        group.add(row_show_only_running_apps);
        window._settings.bind('show-only-running-apps', row_show_only_running_apps, 'active', Gio.SettingsBindFlags.DEFAULT);

        const row_show_only_active_workspace_apps = new Adw.SwitchRow({
            title: 'Show only apps in active workspace',
        });
        group.add(row_show_only_active_workspace_apps);
        window._settings.bind('show-only-active-workspace-apps', row_show_only_active_workspace_apps, 'active', Gio.SettingsBindFlags.DEFAULT);
    }
}
