export const BUSINESS_MODES = [
    {value:'IMPORT', label:'იმპორტი', icon:'solar:box-linear', description:'პროდუქტების შესყიდვა და გაყიდვა'},
    {value:'MANUFACTURING', label:'წარმოება', icon:'solar:structure-linear', description:'მასალების შესყიდვა და პროდუქტის დამზადება'},
    {value:'HYBRID', label:'ორივე', icon:'solar:layers-linear', description:'იმპორტი და წარმოება ერთ ბიზნესში'},
] as const;
export type BusinessMode = typeof BUSINESS_MODES[number]['value'];
export type BusinessFeature = 'imports' | 'manufacturing';
export function isBusinessMode(value:unknown): value is BusinessMode {
    return BUSINESS_MODES.some(mode=>mode.value===value);
}
export function hasBusinessFeature(mode:BusinessMode, feature:BusinessFeature) {
    return mode==='HYBRID'||(feature==='imports'?mode==='IMPORT':mode==='MANUFACTURING');
}
export function businessFeatureMessage(feature:BusinessFeature) {
    return feature==='manufacturing'?'წარმოების ფუნქციებისთვის ბიზნესის პარამეტრებში აირჩიე „წარმოება“ ან „ორივე“.':'ამ შესყიდვებისთვის ბიზნესის პარამეტრებში აირჩიე „იმპორტი“ ან „ორივე“.';
}
