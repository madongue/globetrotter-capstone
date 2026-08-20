export const CAMEROON_CENTER = [5.9631, 12.5029];

export const CITY_COORDINATES = {
  Akwa: [4.0551, 9.7064],
  Bamenda: [5.9631, 10.1591],
  Bafoussam: [5.4778, 10.4176],
  Bangem: [5.0646, 9.9615],
  Bertoua: [4.5773, 13.6846],
  Bimbia: [4.0259, 9.2056],
  Bonapriso: [4.0327, 9.6995],
  Buea: [4.1534, 9.2423],
  Campo: [2.3667, 9.8333],
  Douala: [4.0511, 9.7679],
  Djoum: [2.6722, 12.6664],
  Ebogo: [3.4279, 11.5066],
  Foumban: [5.7266, 10.9000],
  Garoua: [9.3014, 13.3977],
  Kribi: [2.9406, 9.9102],
  Limbe: [4.0242, 9.2149],
  Maroua: [10.5913, 14.3159],
  Mbalmayo: [3.5176, 11.5007],
  Melong: [5.1218, 9.9619],
  Mfou: [3.7437, 11.6344],
  Mundemba: [4.9478, 8.8729],
  Ngaoundere: [7.3277, 13.5847],
  Waza: [11.3409, 14.9528],
  Yaounde: [3.8480, 11.5021],
};

export const PLACE_COORDINATES = {
  'Bimbia Slave Trade Site': [4.0259, 9.2056],
  'Campo Ma\'an National Park': [2.3667, 9.8333],
  'Dja Faunal Reserve': [3.0197, 13.0000],
  'Ebogo Ecotourism Site': [3.4279, 11.5066],
  'Ekom Nkam Waterfalls': [5.0647, 9.9265],
  'Foumban Royal Palace and Museum': [5.7280, 10.8990],
  'Limbe Botanic Garden': [4.0173, 9.2106],
  'Limbe Wildlife Centre': [4.0147, 9.2077],
  'Lobe Falls': [2.8872, 9.8804],
  'Marche des Fleurs': [4.0288, 9.6993],
  'Mefou Primate Park': [3.6556, 11.5648],
  'Mount Cameroon': [4.2039, 9.1700],
  'Mount Manengouba Twin Lakes': [5.0172, 9.8267],
  'National Museum of Cameroon': [3.8620, 11.5149],
  'Reunification Monument': [3.8532, 11.5035],
  'Waza National Park': [11.3409, 14.9528],
};

export function getItemCoordinates(item = {}) {
  const latitude = Number(item.latitude ?? item.map_info?.latitude);
  const longitude = Number(item.longitude ?? item.map_info?.longitude);
  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    return [latitude, longitude];
  }

  const byName = PLACE_COORDINATES[item.name] || CITY_COORDINATES[item.name];
  if (byName) {
    return byName;
  }

  const locationParts = [
    item.quarter,
    item.city,
    item.subdivision,
    item.division,
    item.region,
    item.location,
    item.map_query,
    item.mapQuery,
    item.map_info?.query,
  ].filter(Boolean);

  for (const value of locationParts) {
    const match = Object.entries(CITY_COORDINATES).find(([city]) => (
      String(value).toLowerCase().includes(city.toLowerCase())
    ));
    if (match) {
      return match[1];
    }
  }

  return null;
}
