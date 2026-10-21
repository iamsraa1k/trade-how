import { MetadataRoute } from 'next';

// Chrome only offers "Install app" when the manifest has real 192px and 512px PNG icons that load.
export default function manifest(): MetadataRoute.Manifest {
    return {
        id: '/',
        name: 'TradeHow',
        short_name: 'TradeHow',
        description: 'Your personal trading journal assistant',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#09090b', // zinc-950
        theme_color: '#09090b',
        icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            // The logo already sits inside the safe zone, so Android can crop it to a circle or squircle.
            { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
    };
}
