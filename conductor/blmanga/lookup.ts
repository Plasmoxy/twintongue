/** BL manga lookup
 *
 * csm oid 635d545a6d960eb0ac756afe
 */

import { readFileSync } from 'fs';

async function main() {
    const data: any[] = JSON.parse(
        readFileSync(
            '/Users/seb/git/bilingual-manga/bm_build(home)/json/admin.manga_data.json',
            'utf8'
        )
    );

    const id = '635d545a6d960eb0ac756afe';
    const found = data.find((x) => x['_id']['$oid'] === id);

    console.log(found);
}

main().catch(console.error);
