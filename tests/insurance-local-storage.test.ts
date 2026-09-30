import test from 'node:test';
import assert from 'node:assert/strict';
import {listCloudProfiles} from '../src/lib/insurance-cloud-store.ts';
test('explicit local quote storage rejects remote hosts and non-preview use before connecting',async()=>{
 const before={local:process.env.LOCAL_INSURANCE_DATABASE_URL,preview:process.env.LOCAL_PREVIEW};
 try{process.env.LOCAL_PREVIEW='true';process.env.LOCAL_INSURANCE_DATABASE_URL='postgresql://example.com/quotes';await assert.rejects(listCloudProfiles({teamId:'fictitious',memberId:'fictitious'}),e=>(e as any).status===503);
 process.env.LOCAL_PREVIEW='false';process.env.LOCAL_INSURANCE_DATABASE_URL='postgresql://127.0.0.1/quotes';await assert.rejects(listCloudProfiles({teamId:'fictitious',memberId:'fictitious'}),e=>(e as any).status===503);
 }finally{if(before.local===undefined)delete process.env.LOCAL_INSURANCE_DATABASE_URL;else process.env.LOCAL_INSURANCE_DATABASE_URL=before.local;if(before.preview===undefined)delete process.env.LOCAL_PREVIEW;else process.env.LOCAL_PREVIEW=before.preview;}
});
