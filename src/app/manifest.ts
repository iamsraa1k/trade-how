import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: 'TradeHow',
        short_name: 'TradeHow',
        description: 'Your personal trading journal assistant',
        start_url: '/',
        display: 'standalone',
        background_color: '#09090b', // zinc-950
        theme_color: '#09090b',
        icons: [
            {
                src: '/icon',
                sizes: 'any',
                type: 'image/png',
            },
        ],
    };
}
