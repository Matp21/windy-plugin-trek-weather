import type { ExternalPluginConfig } from '@windy/interfaces';

const config: ExternalPluginConfig = {
    name: 'windy-plugin-trek-weather',
    version: '1.0.0',
    icon: '🥾',
    title: 'Trek Weather Planner',
    description: 'Import a GPX/KML trek route, set daily waypoints and visualize weather for each day segment.',
    author: 'Mattis Pizzol',
    desktopUI: 'rhpane',
    mobileUI: 'fullscreen',
    desktopWidth: 360,
    routerPath: '/trek-weather',
};

export default config;
