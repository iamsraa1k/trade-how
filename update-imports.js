const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
  });
}

const replacements = [
  { from: /@\/components\/ui/g, to: '@/shared/components/ui' },
  { from: /@\/components\/dashboard/g, to: '@/features/dashboard/components' },
  { from: /@\/components\/calendar/g, to: '@/features/calendar/components' },
  { from: /@\/components\/monthly/g, to: '@/features/analytics/components' },
  { from: /@\/components\/rules/g, to: '@/features/rules/components' },
  { from: /@\/components\/entry/g, to: '@/features/trades/components' },
  { from: /@\/components\/trades/g, to: '@/features/trades/components' },
  { from: /@\/components\/TradeFilterContext/g, to: '@/features/trades/context/TradeFilterContext' },
  { from: /@\/components\/Providers/g, to: '@/shared/components/Providers' },
  { from: /@\/components\/theme-provider/g, to: '@/shared/components/theme-provider' },
  { from: /@\/components\/layout/g, to: '@/shared/components/layout' }
];

walkDir(srcDir, (filePath) => {
  if (filePath.endsWith('.tsx') || filePath.endsWith('.ts')) {
    let content = fs.readFileSync(filePath, 'utf8');
    let original = content;
    
    replacements.forEach(({ from, to }) => {
      content = content.replace(from, to);
    });

    if (content !== original) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log('Updated:', filePath);
    }
  }
});
