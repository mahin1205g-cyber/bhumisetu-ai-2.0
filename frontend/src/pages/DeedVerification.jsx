import Input from '../components/Input';
import LocationCombobox, { displayLocationName } from '../components/LocationCombobox';
import Button from '../components/Button';
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../api';
import PageHeader from '../components/PageHeader';
import {
  FileCheck2, UploadCloud, Search, AlertTriangle,
  RefreshCw, Info, Cpu, CheckCircle2
} from 'lucide-react';

const OCR_LOCATION_ALIASES = new Map([
  ['পুবাইল', 'pubail'],
  ['পূবাইল', 'pubail'],
]);

const normalizedLocationName = (value) => {
  const normalized = String(value || '').trim().normalize('NFKC').toLocaleLowerCase();
  return OCR_LOCATION_ALIASES.get(normalized) || normalized;
};

const locationNameMatches = (item, value) => {
  const normalized = normalizedLocationName(value);
  return [item.name_bn, item.name_en, item.code]
    .filter(Boolean)
    .some((name) => normalizedLocationName(name) === normalized);
};

const OCR_FIELD_LABELS = {
  deed_no: ['দলিল নম্বর', 'Deed number'],
  deed_type: ['দলিলের ধরন', 'Deed type'],
  reg_year: ['নিবন্ধন সাল', 'Registration year'],
  district: ['জেলা', 'District'],
  upazila: ['উপজেলা / থানা', 'Upazila / Thana'],
  mouza: ['মৌজা', 'Mouza'],
  plot_id: ['দাগ / প্লট', 'Plot number'],
  khatian_no: ['খতিয়ান নম্বর', 'Khatian number'],
  union_ward: ['ইউনিয়ন / ওয়ার্ড', 'Union / Ward'],
  owner_name: ['মালিক / গ্রহীতা', 'Owner / transferee'],
  buyer_name: ['ক্রেতা / গ্রহীতা', 'Buyer / transferee'],
  seller_name: ['বিক্রেতা', 'Seller'],
  area: ['জমির পরিমাণ', 'Land area'],
};

const getLocationSuggestions = (items, lang) => {
  const uniqueItems = [];
  const seenIds = new Set();
  (items || []).forEach((item) => {
    const id = String(item.id ?? item.code ?? '');
    if (!id || seenIds.has(id)) return;
    seenIds.add(id);
    uniqueItems.push(item);
  });

  const labelCounts = new Map();
  uniqueItems.forEach((item) => {
    const label = displayLocationName(item, lang);
    if (!label) return;
    const key = normalizedLocationName(label);
    labelCounts.set(key, (labelCounts.get(key) || 0) + 1);
  });

  return uniqueItems.flatMap((item) => {
    const label = displayLocationName(item, lang);
    if (!label) return [];
    const key = normalizedLocationName(label);
    const disambiguator = item.code || item.id;
    const value = labelCounts.get(key) > 1 ? `${label} (${disambiguator})` : label;
    return [{ item, label, value }];
  });
};

const findLocationSuggestion = (items, value, lang) => {
  const normalizedValue = normalizedLocationName(value);
  const suggestion = getLocationSuggestions(items, lang)
    .find((entry) => normalizedLocationName(entry.value) === normalizedValue);
  if (suggestion) return suggestion.item;
  const matches = (items || []).filter((item) => locationNameMatches(item, value));
  return matches.length === 1 ? matches[0] : null;
};

const EMPTY_VERIFICATION_FORM = {
  deed_no: '', reg_year: '', deed_type: '', district: '', upazila: '', mouza: '',
  union_ward: '', plot_id: '', khatian_no: '', buyer_name: '', seller_name: '', notes: ''
};

const isDeedNumberShaped = (value) => /^[0-9\u09E6-\u09EFA-Za-z\s\-/]+$/.test(String(value || ''));

export default function DeedVerification({
  setActiveTab,
  setVerificationResult,
  navigateBack,
  verificationDraft,
  setVerificationDraft,
  onFindDeed,
}) {
  const { lang, t, user } = useApp();

  const [formData, setFormData] = useState(() => ({
    ...EMPTY_VERIFICATION_FORM,
    ...(verificationDraft?.formData || {}),
  }));

  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [operation, setOperation] = useState('');
  const [verifyStage, setVerifyStage] = useState(0);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [dragActive, setDragActive] = useState(false);
  const [divisions, setDivisions] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [locations, setLocations] = useState([]);
  const [mouzas, setMouzas] = useState([]);
  const [unions, setUnions] = useState([]);
  const [locationType, setLocationType] = useState(verificationDraft?.locationType || 'upazila');
  const [divisionId, setDivisionId] = useState(verificationDraft?.divisionId || '');
  const [districtId, setDistrictId] = useState(verificationDraft?.districtId || '');
  const [locationId, setLocationId] = useState(verificationDraft?.locationId || '');
  const [mouzaId, setMouzaId] = useState(verificationDraft?.mouzaId || '');
  const [mouzaMode, setMouzaMode] = useState(
    verificationDraft?.mouzaMode || (verificationDraft?.mouzaId ? 'catalog' : 'manual')
  );
  const mouzaModeTouched = useRef(false);
  const [unionId, setUnionId] = useState(verificationDraft?.unionId || '');
  const [locationCoverage, setLocationCoverage] = useState(null);
  const [deedTypes, setDeedTypes] = useState([]);
  const [ocrReview, setOcrReview] = useState(null);
  const [lookupState, setLookupState] = useState(verificationDraft?.lookupState || 'IDLE');
  const [lookupCandidates, setLookupCandidates] = useState(verificationDraft?.lookupCandidates || []);
  const [selectedDeed, setSelectedDeed] = useState(verificationDraft?.selectedDeed || null);
  useEffect(() => {
    setVerificationDraft?.({
      formData,
      locationType,
      divisionId,
      districtId,
      locationId,
      mouzaId,
      mouzaMode,
      unionId,
      lookupState,
      lookupCandidates,
      selectedDeed,
    });
  }, [formData, locationType, divisionId, districtId, locationId, mouzaId, mouzaMode, unionId, lookupState, lookupCandidates, selectedDeed, setVerificationDraft]);

  useEffect(() => {
    let active = true;
    api.getLocationDivisions().then((response) => {
      if (!active) return;
      setDivisions(response.items || []);
      setLocationCoverage(response.coverage || null);
    }).catch((err) => {
      if (active) setError(err.message);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    api.getVerificationDeedTypes().then((response) => {
      if (active) setDeedTypes(response.items || []);
    }).catch((err) => {
      if (active) setError(err.message);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setDistricts([]);
    setLocations([]);
    if (!divisionId) return () => { active = false; };
    api.getLocationDistricts({ divisionId }).then((response) => {
      if (!active) return;
      setDistricts(response.items || []);
      setLocationCoverage(response.coverage || null);
    }).catch((err) => {
      if (active) setError(err.message);
    });
    return () => { active = false; };
  }, [divisionId]);

  useEffect(() => {
    let active = true;
    setLocations([]);
    if (!districtId) return () => { active = false; };
    const request = locationType === 'upazila'
      ? api.getLocationUpazilas(districtId)
      : api.getLocationThanas(districtId);
    request.then((response) => {
      if (active) setLocations(response.items || []);
    }).catch((err) => {
      if (active) setError(err.message);
    });
    return () => { active = false; };
  }, [districtId, locationType]);

  useEffect(() => {
    let active = true;
    setMouzas([]);
    if (!locationId) return () => { active = false; };
    const request = locationType === 'upazila'
      ? api.getLocationMouzas({ upazilaId: locationId })
      : api.getLocationMouzas({ thanaId: locationId });
    request.then((response) => {
      if (!active) return;
      const items = response.items || [];
      setMouzas(items);
      if (!items.length) {
        setMouzaId('');
        setMouzaMode('manual');
      } else if (mouzaId && !items.some((item) => String(item.id) === String(mouzaId))) {
        setMouzaId('');
        setMouzaMode('manual');
      } else if (!mouzaId && !formData.mouza && !mouzaModeTouched.current) {
        setMouzaMode('catalog');
      }
    }).catch(() => {
      if (!active) return;
      setMouzas([]);
      setMouzaId('');
      setMouzaMode('manual');
    });
    return () => { active = false; };
  }, [locationId, locationType]);

  useEffect(() => {
    let active = true;
    setUnions([]);
    if (locationType !== 'upazila' || !locationId) {
      setUnionId('');
      setFormData((previous) => ({ ...previous, union_ward: '' }));
      return () => { active = false; };
    }
    api.getLocationUnions(locationId).then((response) => {
      if (!active) return;
      const items = response.items || [];
      setUnions(items);
      const selected = items.find((item) => String(item.id) === String(unionId));
      if (!selected) {
        setUnionId('');
        setFormData((previous) => ({ ...previous, union_ward: '' }));
      }
    }).catch(() => {
      if (!active) return;
      setUnions([]);
      setUnionId('');
      setFormData((previous) => ({ ...previous, union_ward: '' }));
    });
    return () => { active = false; };
  }, [locationId, locationType]);

  useEffect(() => {
    const selectedDistrict = districts.find((item) => String(item.id) === String(districtId));
    const selectedLocation = locations.find((item) => String(item.id) === String(locationId));
    const selectedMouza = mouzas.find((item) => String(item.id) === String(mouzaId));
    const selectedUnion = unions.find((item) => String(item.id) === String(unionId));
    setFormData((previous) => ({
      ...previous,
      district: selectedDistrict ? displayLocationName(selectedDistrict, 'bn') : previous.district,
      upazila: selectedLocation ? displayLocationName(selectedLocation, 'bn') : previous.upazila,
      mouza: selectedMouza ? displayLocationName(selectedMouza, 'bn') : previous.mouza,
      union_ward: selectedUnion ? displayLocationName(selectedUnion, 'bn') : previous.union_ward,
    }));
  }, [lang, districts, locations, mouzas, unions, districtId, locationId, mouzaId, unionId]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'mouza') mouzaModeTouched.current = true;
    setFormData(prev => ({ ...prev, [name]: value }));
    setFieldErrors((previous) => ({ ...previous, [name]: undefined }));
    if (name === 'deed_no' && value !== formData.deed_no) {
      setLookupState('IDLE');
      setLookupCandidates([]);
      setSelectedDeed(null);
    }
  };

  const fieldClass = (field) => fieldErrors[field] ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500' : '';

  const applyExtractedLocationFields = async (extracted) => {
    const districtText = String(extracted.district || '').trim();
    const upazilaText = String(extracted.upazila || '').trim();
    const upazilaLookupText = OCR_LOCATION_ALIASES.has(upazilaText.normalize('NFKC').toLocaleLowerCase())
      ? 'Pubail'
      : upazilaText;
    if (!districtText && !upazilaText) return;

    let nextDivisionId = districtText ? '' : divisionId;
    let nextDistrictId = districtText ? '' : districtId;
    let nextLocationId = '';
    let nextLocationType = locationType;
    let nextDistricts = districts;
    let nextLocations = locations;
    let districtLabel = districtText || undefined;
    let upazilaLabel = upazilaText || (districtText ? '' : undefined);

    try {
      if (districtText) {
        const [divisionResponse, districtResponse] = await Promise.all([
          api.getLocationDivisions(),
          api.getLocationDistricts({ q: districtText, limit: 500 }),
        ]);
        const matchedDistrict = (districtResponse.items || []).find((item) => locationNameMatches(item, districtText));
        const matchedDivision = matchedDistrict && (divisionResponse.items || []).find(
          (item) => String(item.id) === String(matchedDistrict.division?.id)
        );

        if (matchedDistrict && matchedDivision) {
          nextDivisionId = String(matchedDivision.id);
          nextDistrictId = String(matchedDistrict.id);
          districtLabel = displayLocationName(matchedDistrict, 'bn');
          const [divisionDistricts, upazilaResponse, thanaResponse] = await Promise.all([
            api.getLocationDistricts({ divisionId: matchedDivision.id, limit: 500 }),
            api.getLocationUpazilas(matchedDistrict.id, { q: upazilaLookupText, limit: 500 }),
            api.getLocationThanas(matchedDistrict.id, { q: upazilaLookupText, limit: 500 }),
          ]);
          nextDistricts = divisionDistricts.items || districtResponse.items || [];
          const matchedUpazila = upazilaText && (upazilaResponse.items || []).find((item) => locationNameMatches(item, upazilaText));
          const matchedThana = upazilaText && (thanaResponse.items || []).find((item) => locationNameMatches(item, upazilaText));
          const matchedLocation = extracted.upazila_type === 'police_thana'
            ? (matchedThana || matchedUpazila)
            : (matchedUpazila || matchedThana);
          nextLocationType = matchedUpazila ? 'upazila' : matchedThana ? 'police_thana' : 'upazila';
          if (!matchedLocation && extracted.upazila_type === 'police_thana') nextLocationType = 'police_thana';
          nextLocations = matchedUpazila ? (upazilaResponse.items || []) : matchedThana ? (thanaResponse.items || []) : (upazilaResponse.items || []);
          nextLocationId = matchedLocation ? String(matchedLocation.id) : '';
          if (matchedLocation) upazilaLabel = lang === 'bn' && !matchedLocation.name_bn
            ? upazilaText
            : displayLocationName(matchedLocation, 'bn');
        } else {
          nextDistricts = [];
          nextLocations = [];
          districtLabel = districtText;
        }
      } else if (upazilaText && districtId) {
        const [upazilaResponse, thanaResponse] = await Promise.all([
          api.getLocationUpazilas(districtId, { q: upazilaLookupText, limit: 500 }),
          api.getLocationThanas(districtId, { q: upazilaLookupText, limit: 500 }),
        ]);
        const matchedUpazila = (upazilaResponse.items || []).find((item) => locationNameMatches(item, upazilaText));
        const matchedThana = (thanaResponse.items || []).find((item) => locationNameMatches(item, upazilaText));
        const matchedLocation = extracted.upazila_type === 'police_thana'
          ? (matchedThana || matchedUpazila)
          : (matchedUpazila || matchedThana);
        nextLocationType = matchedUpazila ? 'upazila' : matchedThana ? 'police_thana' : 'upazila';
        if (!matchedLocation && extracted.upazila_type === 'police_thana') nextLocationType = 'police_thana';
        nextLocations = matchedUpazila ? (upazilaResponse.items || []) : matchedThana ? (thanaResponse.items || []) : (upazilaResponse.items || []);
        nextLocationId = matchedLocation ? String(matchedLocation.id) : '';
        if (matchedLocation) upazilaLabel = lang === 'bn' && !matchedLocation.name_bn
          ? upazilaText
          : displayLocationName(matchedLocation, 'bn');
      }
    } catch {
      if (districtText) {
        nextDivisionId = '';
        nextDistrictId = '';
        nextLocationId = '';
      }
    }

    setDivisionId(nextDivisionId);
    setDistrictId(nextDistrictId);
    setLocationType(nextLocationType);
    setLocationId(nextLocationId);
    setMouzaId('');
    mouzaModeTouched.current = Boolean(extracted.mouza);
    setMouzaMode(extracted.mouza ? 'manual' : 'catalog');
    setDistricts(nextDistricts);
    setLocations(nextLocations);
    setFormData((previous) => ({
      ...previous,
      district: districtLabel ?? previous.district,
      upazila: upazilaLabel ?? previous.upazila,
      mouza: extracted.mouza || previous.mouza,
      union_ward: '',
    }));
    setUnionId('');
    setFieldErrors((previous) => ({
      ...previous,
      division_id: undefined,
      district_id: undefined,
      location_id: undefined,
      mouza: undefined,
    }));
  };

  const focusFirstFieldError = (errors) => {
    const fieldToId = {
      deed_no: 'verify-deed-no', reg_year: 'verify-reg-year', deed_type: 'verify-deed-type',
      division_id: 'verify-division', district_id: 'verify-district', district: 'verify-district',
      location_id: 'verify-upazila', location_type: 'verify-upazila', upazila: 'verify-upazila',
      mouza: 'verify-mouza-manual', plot_id: 'verify-plot-id', khatian_no: 'verify-khatian-no',
      owner_name: 'verify-owner-name', buyer_name: 'verify-owner-name', seller_name: 'verify-seller-name',
    };
    const firstField = Object.keys(errors)[0];
    const input = document.getElementById(fieldToId[firstField] || firstField);
    input?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    input?.focus({ preventScroll: true });
  };

  const validateForm = () => {
    const errors = {};
    const required = (key, value, label) => {
      if (!String(value ?? '').trim()) {
        errors[key] = lang === 'bn' ? `${label} পূরণ করুন।` : `${label} is required.`;
      }
    };
    required('deed_no', formData.deed_no, lang === 'bn' ? 'দলিল নম্বর' : 'Deed number');
    required('reg_year', formData.reg_year, lang === 'bn' ? 'নিবন্ধন সাল' : 'Registration year');
    required('deed_type', formData.deed_type, lang === 'bn' ? 'দলিলের ধরন' : 'Deed type');
    if (formData.reg_year && (!Number.isInteger(Number(formData.reg_year)) || Number(formData.reg_year) < 1950 || Number(formData.reg_year) > new Date().getFullYear())) {
      errors.reg_year = lang === 'bn' ? '১৯৫০ থেকে বর্তমান সাল পর্যন্ত একটি সঠিক সাল লিখুন।' : 'Enter a valid year from 1950 through the current year.';
    }
    if (!divisionId || !divisions.some((item) => String(item.id) === String(divisionId))) {
      errors.division_id = lang === 'bn' ? 'তালিকা থেকে বিভাগ নির্বাচন করুন।' : 'Select a division from the list.';
    }
    const selectedDistrict = districts.find((item) => String(item.id) === String(districtId));
    if (!selectedDistrict || String(selectedDistrict.division_id) !== String(divisionId)) {
      errors.district_id = lang === 'bn' ? 'নির্বাচিত বিভাগের তালিকা থেকে জেলা বাছুন।' : 'Choose a district belonging to the selected division.';
    }
    const selectedLocation = locations.find((item) => String(item.id) === String(locationId));
    if (!selectedLocation || String(selectedLocation.district_id) !== String(districtId)) {
      errors.location_id = lang === 'bn' ? 'নির্বাচিত জেলার তালিকা থেকে উপজেলা / থানা বাছুন।' : 'Choose an Upazila / Thana belonging to the selected district.';
    }
    required('mouza', formData.mouza, lang === 'bn' ? 'মৌজার নাম / জে.এল. নম্বর' : 'Mouza name / J.L. number');
    if (mouzaMode === 'catalog' && !mouzas.some((item) => String(item.id) === String(mouzaId))) {
      errors.mouza = lang === 'bn'
        ? 'তালিকা থেকে মৌজা বাছুন, অথবা হাতে লেখার ধরন নির্বাচন করুন।'
        : 'Select a Mouza from the list or switch to manual entry.';
    }
    required('plot_id', formData.plot_id, lang === 'bn' ? 'দাগ / প্লট নম্বর' : 'Dag / Plot number');
    required('khatian_no', formData.khatian_no, lang === 'bn' ? 'খতিয়ান নম্বর' : 'Khatian number');
    required('buyer_name', formData.buyer_name, lang === 'bn' ? 'ক্রেতা / গ্রহীতার নাম' : 'Buyer / transferee name');
    required('seller_name', formData.seller_name, lang === 'bn' ? 'বিক্রেতার নাম' : 'Seller name');
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      focusFirstFieldError(errors);
      return false;
    }
    return true;
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    setError('');
    const deedNo = String(formData.deed_no || '').trim();
    if (!deedNo) {
      setFieldErrors((previous) => ({ ...previous, deed_no: lang === 'bn' ? 'দলিল নম্বর লিখুন।' : 'Enter a deed number.' }));
      document.getElementById('verify-deed-no')?.focus();
      return;
    }
    if (deedNo.length > 120 || !isDeedNumberShaped(deedNo)) {
      setFieldErrors((previous) => ({ ...previous, deed_no: lang === 'bn' ? 'দলিল নম্বরে অক্ষর, সংখ্যা, স্পেস, হাইফেন বা স্ল্যাশ ব্যবহার করুন।' : 'Use letters, digits, spaces, hyphens, or slashes in the deed number.' }));
      document.getElementById('verify-deed-no')?.focus();
      return;
    }

    setLoading(true);
    setOperation('verify');
    setError('');
    setVerifyStage(1);

    try {
      let deedCandidate = selectedDeed;
      const normalizedQuery = deedNo.replace(/\s+/g, '').toLocaleUpperCase();
      const selectedNumber = String(deedCandidate?.deed_no || '').replace(/\s+/g, '').toLocaleUpperCase();
      if (!deedCandidate?.id || normalizedQuery !== selectedNumber) {
        const lookup = await api.searchDeedByNumber(deedNo);
        if (lookup?.locked) {
          setError(lookup.message_bn || lookup.message_en || (lang === 'bn' ? 'নিরাপত্তার জন্য অনুসন্ধান সাময়িকভাবে বন্ধ।' : 'Search is temporarily paused for security.'));
          return;
        }
        if (!lookup?.found || !Array.isArray(lookup.results) || lookup.results.length === 0) {
          setLookupState('DEED_NOT_FOUND');
          setLookupCandidates([]);
          setSelectedDeed(null);
          return;
        }
        if (lookup.results.length > 1) {
          setLookupState('AMBIGUOUS');
          setLookupCandidates(lookup.results);
          setSelectedDeed(null);
          return;
        }
        [deedCandidate] = lookup.results;
        setSelectedDeed(deedCandidate);
        setLookupCandidates([]);
        setLookupState('DEED_FOUND');
      }

      if (!validateForm()) return;

      const payload = {
        ...formData,
        selected_deed_id: Number(deedCandidate.id),
        reg_year: formData.reg_year ? Number(formData.reg_year) : null,
        division_id: divisionId ? Number(divisionId) : undefined,
        district_id: districtId ? Number(districtId) : undefined,
        location_id: locationId ? Number(locationId) : undefined,
        location_type: locationId ? locationType : undefined,
        mouza_id: mouzaMode === 'catalog' && mouzaId ? Number(mouzaId) : undefined,
        mouza_input_mode: mouzaMode,
        union_id: unionId ? Number(unionId) : undefined,
      };
      const result = await api.verifyDeed(payload, user?.id);
      if (result?.lookup_status === 'DEED_NOT_FOUND') {
        setLookupState('DEED_NOT_FOUND');
        setSelectedDeed(null);
        setLookupCandidates([]);
        return;
      }
      if (result?.lookup_status === 'AMBIGUOUS') {
        let candidates = result.candidates || [];
        if (!candidates.length) {
          const lookup = await api.searchDeedByNumber(deedNo);
          candidates = lookup?.results || [];
        }
        setLookupState('AMBIGUOUS');
        setLookupCandidates(candidates);
        setSelectedDeed(null);
        return;
      }
      if (result?.lookup_status === 'INVALID_INPUT') {
        setLookupState('IDLE');
        setSelectedDeed(null);
        setError(result.message_bn || result.message_en || (lang === 'bn' ? 'নির্বাচিত দলিলটি আবার খুঁজুন।' : 'Search for the selected deed again.'));
        return;
      }
      setVerifyStage(3);

      if (result?.verification_ref) {
        try { sessionStorage.setItem('bhumisetu:lastVerificationRef', result.verification_ref); } catch { /* storage may be disabled */ }
      }
      setVerificationResult(result);
      setActiveTab('verification-result');
    } catch (err) {
      const backendFieldErrors = err.payload?.detail?.field_errors;
      if (backendFieldErrors) {
        setFieldErrors(backendFieldErrors);
        focusFirstFieldError(backendFieldErrors);
      }
      setError(err.message);
    } finally {
      setLoading(false);
      setOperation('');
      setVerifyStage(0);
    }
  };

  const buildVerificationDraft = () => ({
    formData,
    locationType,
    divisionId,
    districtId,
    locationId,
    unionId,
    lookupState,
    lookupCandidates,
    selectedDeed,
  });

  const findDeed = () => {
    if (onFindDeed) onFindDeed(formData.deed_no, buildVerificationDraft());
    else setActiveTab('deed-search');
  };

  const chooseDeedCandidate = (candidate) => {
    if (!candidate?.id) return;
    setSelectedDeed(candidate);
    setLookupCandidates([]);
    setLookupState('DEED_FOUND');
    setError('');
    setTimeout(() => document.getElementById('verify-deed-no')?.focus(), 0);
  };

  const retryDeedLookup = () => {
    setLookupState('IDLE');
    setLookupCandidates([]);
    setSelectedDeed(null);
    setError('');
    document.getElementById('verify-deed-no')?.focus();
  };

  const handleFileUpload = async (selectedFile) => {
    if (!selectedFile) return;
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
    const allowedExtensions = /\.(pdf|jpe?g|png)$/i;
    if (!allowedTypes.includes(selectedFile.type) && !allowedExtensions.test(selectedFile.name)) {
      setError(lang === 'bn' ? 'শুধু PDF, JPG বা PNG ফাইল দিন।' : 'Choose a PDF, JPG, or PNG file.');
      return;
    }
    if (selectedFile.size > 10 * 1024 * 1024) {
      setError(lang === 'bn' ? 'ফাইলের সর্বোচ্চ আকার ১০ MB।' : 'File size must be 10 MB or less.');
      return;
    }
    setFile(selectedFile);
    setOcrReview(null);
    setLoading(true);
    setOperation('ocr');
    setError('');
    setVerifyStage(0);

    try {
      const fd = new FormData();
      fd.append('file', selectedFile);
      if (user?.id) fd.append('user_id', user.id);
      if (formData.mouza) fd.append('selected_mouza', formData.mouza);

      if (divisionId && districtId && locationId) {
        fd.append('division_id', divisionId);
        fd.append('district_id', districtId);
        fd.append('location_id', locationId);
        fd.append('location_type', locationType);
        if (mouzaId) fd.append('mouza_id', mouzaId);
      }
      const result = await api.uploadDeed(fd);
      const extracted = result.extracted_fields || {};
      setFormData((previous) => ({
        ...previous,
        deed_no: extracted.deed_no || previous.deed_no,
        deed_type: extracted.deed_type || previous.deed_type,
        reg_year: extracted.reg_year || previous.reg_year,
        mouza: extracted.mouza || previous.mouza,
        union_ward: extracted.union_ward || previous.union_ward,
        plot_id: extracted.plot_id || previous.plot_id,
        khatian_no: extracted.khatian_no || previous.khatian_no,
        buyer_name: extracted.buyer_name || extracted.owner_name || previous.buyer_name,
        seller_name: extracted.seller_name || previous.seller_name,
      }));
      await applyExtractedLocationFields(extracted);
      setFieldErrors((previous) => ({
        ...previous,
        deed_no: undefined,
        deed_type: undefined,
        reg_year: undefined,
        plot_id: undefined,
        khatian_no: undefined,
        buyer_name: undefined,
        seller_name: undefined,
      }));
      setOcrReview(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setOperation('');
      setVerifyStage(0);
    }
  };

  return (
    <div className="gov-container py-6 space-y-6 max-w-4xl">
      {/* Top Page Header with Universal Back Button & Breadcrumbs */}
      <PageHeader
        title={lang === 'bn' ? 'ডিজিটাল দলিল ও মালিকানা যাচাই' : 'Digital Deed & Land Ownership Verification'}
        subtitle={
          lang === 'bn'
            ? 'দলিলের তথ্য দিন বা স্ক্যান থেকে টেক্সট বের করে যাচাই করে নিন।'
            : 'Enter deed details or extract document text for manual review.'
        }
        icon={FileCheck2}
        badge={lang === 'bn' ? 'তথ্য যাচাই সহায়ক' : 'Review assistance'}
        badgeColor="emerald"
        breadcrumbs={[
          { label: lang === 'bn' ? 'ড্যাশবোর্ড' : 'Dashboard', tab: 'dashboard' }
        ]}
        setActiveTab={setActiveTab}
        onBack={() => navigateBack ? navigateBack('dashboard') : (setActiveTab && setActiveTab('dashboard'))}
        fallbackTab="dashboard"
      />

      {/* Staged Multi-Phase Verification Overlay */}
      {loading && operation === 'verify' && (
        <div className="p-5 rounded-xl bg-slate-900 text-white border border-emerald-500/30 shadow-xl space-y-4 animate-page-enter">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Cpu className="w-5 h-5 text-emerald-400 animate-pulse" />
              <span className="font-bold text-sm">
                {lang === 'bn' ? 'দলিলের তথ্য প্রক্রিয়াকরণ চলছে...' : 'Processing submitted deed details...'}
              </span>
            </div>
            <span className="text-xs font-mono text-emerald-400 font-bold">
              {verifyStage === 1 ? 'Phase 1/3' : verifyStage === 2 ? 'Phase 2/3' : 'Phase 3/3'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className={`p-3 rounded-lg border transition-all ${
              verifyStage >= 1
                ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300'
                : 'bg-slate-800/50 border-slate-700 text-slate-400'
            }`}>
              <div className="font-semibold flex items-center gap-1.5">
                {verifyStage > 1 ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" />}
                <span>1. {lang === 'bn' ? 'দলিল ও তথ্য প্রক্রিয়াকরণ' : 'Deed Parsing'}</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                {lang === 'bn' ? 'দলিল নং ও দাগ শনাক্তকরণ' : 'Parsing deed & plot tags'}
              </p>
            </div>

            <div className={`p-3 rounded-lg border transition-all ${
              verifyStage >= 2
                ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300'
                : 'bg-slate-800/50 border-slate-700 text-slate-400'
            }`}>
              <div className="font-semibold flex items-center gap-1.5">
                {verifyStage > 2 ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : verifyStage === 2 ? <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" /> : <span className="w-3.5 h-3.5 rounded-full border border-slate-600 inline-block" />}
                <span>2. {lang === 'bn' ? 'বালাম বই ক্রস-ম্যাচ' : 'Balam Registry Match'}</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                {lang === 'bn' ? 'সাব-রেজিস্ট্রি বালাম যাচাই' : 'Sub-registry record match'}
              </p>
            </div>

            <div className={`p-3 rounded-lg border transition-all ${
              verifyStage >= 3
                ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300'
                : 'bg-slate-800/50 border-slate-700 text-slate-400'
            }`}>
              <div className="font-semibold flex items-center gap-1.5">
                {verifyStage >= 3 ? <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" /> : <span className="w-3.5 h-3.5 rounded-full border border-slate-600 inline-block" />}
                <span>3. {lang === 'bn' ? 'C++ জালিয়াতি ও কার্টেল' : 'C++ Native Graph Engine'}</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                {lang === 'bn' ? 'সাইকেল ও নাম গরমিল এআই' : 'Cartel cycle & fraud graph'}
              </p>
            </div>
          </div>
        </div>
      )}

      {locationCoverage?.status !== 'complete' && (
        <div className="p-3.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 text-xs">
          {lang === 'bn'
            ? (locationCoverage?.dataset?.record_counts
              ? `Location data database-এ সফলভাবে load হয়েছে।`
              : 'Location data database-এ load হয়নি। এই অবস্থায় কোনো location option দেখা যাবে না; এটি সরকারি মালিকানা সনদও নয়।')
            : (locationCoverage?.dataset?.record_counts
              ? `Location data has been loaded in the database successfully`
              : 'Location data has not been loaded in the database, so the selectors will be empty. This is not an official ownership certificate.')}
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {lookupState === 'DEED_NOT_FOUND' && (
        <section className="rounded-2xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/80 dark:bg-rose-950/30 p-5 sm:p-6 space-y-4" role="status" aria-live="polite">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 mt-0.5 shrink-0 text-rose-600 dark:text-rose-400" />
            <div className="space-y-1">
              <h2 className="text-base font-extrabold text-rose-900 dark:text-rose-200">{lang === 'bn' ? 'দলিল নম্বরটি ডেটাবেজে পাওয়া যায়নি' : 'Deed number not found in the database'}</h2>
              <p className="text-sm leading-relaxed text-rose-800 dark:text-rose-300">
                {lang === 'bn'
                  ? 'আপনার দেওয়া দলিল নম্বরটি আমাদের ডেটাবেজে পাওয়া যায়নি। সঠিক নম্বর দিয়ে আবার চেষ্টা করুন অথবা দলিল খুঁজে দেখুন। এটি দলিলটি জাল বা আইনগতভাবে অবৈধ—এমন প্রমাণ নয়।'
                  : 'Your submitted deed number was not found in our database. Check the number or find your deed. This does not establish that the deed is fake or legally invalid.'}
              </p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button type="button" onClick={retryDeedLookup} className="gov-btn-primary justify-center text-xs">
              <RefreshCw className="w-3.5 h-3.5" />
              <span>{lang === 'bn' ? 'আবার চেষ্টা করুন' : 'Try Again'}</span>
            </Button>
            <Button type="button" onClick={findDeed} className="gov-btn-secondary justify-center text-xs">
              <Search className="w-3.5 h-3.5" />
              <span>{lang === 'bn' ? 'দলিল খুঁজুন' : 'Find Deed'}</span>
            </Button>
          </div>
        </section>
      )}

      {lookupState === 'AMBIGUOUS' && (
        <section className="rounded-2xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/80 dark:bg-amber-950/30 p-5 sm:p-6 space-y-4" aria-labelledby="ambiguous-deeds-title">
          <div>
            <h2 id="ambiguous-deeds-title" className="text-base font-extrabold text-amber-900 dark:text-amber-200">{lang === 'bn' ? 'একই নম্বরে একাধিক দলিল পাওয়া গেছে' : 'Multiple deeds share this number'}</h2>
            <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">{lang === 'bn' ? 'যাচাইয়ের আগে সঠিক রেকর্ডটি বেছে নিন।' : 'Select the correct record before verification.'}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {lookupCandidates.map((candidate) => (
              <article key={candidate.id} className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-white dark:bg-gray-900 p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-sm text-gray-900 dark:text-white">{candidate.deed_no}</h3>
                    <p className="text-xs text-gray-500">{candidate.reg_year ? `${candidate.reg_year} · ` : ''}{candidate.deed_type || ''}</p>
                  </div>
                  <span className="text-[10px] rounded-full bg-amber-100 dark:bg-amber-900/50 px-2 py-1 text-amber-800 dark:text-amber-200">ID #{candidate.id}</span>
                </div>
                <dl className="grid grid-cols-2 gap-2 text-xs">
                  {[
                    [lang === 'bn' ? 'অবস্থান' : 'Location', [candidate.district, candidate.upazila, candidate.mouza].filter(Boolean).join(' · ')],
                    [lang === 'bn' ? 'দাগ / খতিয়ান' : 'Dag / Khatian', [candidate.plot_id, candidate.khatian_no].filter(Boolean).join(' / ')],
                    [lang === 'bn' ? 'বিক্রেতা' : 'Seller', candidate.seller_name],
                    [lang === 'bn' ? 'ক্রেতা' : 'Buyer', candidate.buyer_name],
                  ].filter(([, value]) => value).map(([label, value]) => (
                    <div key={label} className="min-w-0">
                      <dt className="text-[10px] text-gray-500">{label}</dt>
                      <dd className="break-words font-semibold text-gray-800 dark:text-gray-200">{value}</dd>
                    </div>
                  ))}
                </dl>
                <Button type="button" onClick={() => chooseDeedCandidate(candidate)} className="gov-btn-primary w-full justify-center text-xs">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{lang === 'bn' ? 'এই দলিলটি বেছে নিন' : 'Select this deed'}</span>
                </Button>
              </article>
            ))}
          </div>
          <Button type="button" onClick={findDeed} className="gov-btn-secondary text-xs">
            <Search className="w-3.5 h-3.5" />
            <span>{lang === 'bn' ? 'Find Deed পেজে বিস্তারিত খুঁজুন' : 'Find using detailed search'}</span>
          </Button>
        </section>
      )}

      {/* Main Dual Grid: Form & File Upload */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left 2 Cols: Structured Input Form */}
        <div className="md:col-span-2 gov-card p-6 space-y-5">
          <h2 className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-2 border-b border-gray-100 dark:border-gray-800 pb-2">
            <Search className="w-4 h-4 text-[#0b462d] dark:text-emerald-400" />
            <span>{lang === 'bn' ? '১. দলিলের পরিচিতি ও বিবরণ দিন' : '1. Enter Deed Identification Details'}</span>
          </h2>

          {lookupState === 'DEED_FOUND' && selectedDeed && (
            <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/25 p-4 space-y-2" role="status">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-bold text-emerald-900 dark:text-emerald-200">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{lang === 'bn' ? 'দলিল রেকর্ড পাওয়া গেছে' : 'Deed record found'}</span>
                </div>
                <span className="text-[10px] text-emerald-800 dark:text-emerald-300">{lang === 'bn' ? 'অ্যাপের ডেটাবেজ' : 'Application database'}</span>
              </div>
              <p className="text-xs text-emerald-900 dark:text-emerald-200">
                <strong>{selectedDeed.deed_no}</strong>{selectedDeed.reg_year ? ` · ${selectedDeed.reg_year}` : ''}
                {[selectedDeed.district, selectedDeed.upazila, selectedDeed.mouza, selectedDeed.plot_id].filter(Boolean).length
                  ? ` · ${[selectedDeed.district, selectedDeed.upazila, selectedDeed.mouza, selectedDeed.plot_id].filter(Boolean).join(' · ')}`
                  : ''}
              </p>
              <p className="text-[11px] leading-relaxed text-emerald-800 dark:text-emerald-300">
                {lang === 'bn' ? 'তুলনার জন্য মূল দলিল অনুযায়ী তথ্য হাতে দিন বা OCR থেকে পড়ে যাচাই করুন। ডেটাবেজের রেকর্ডকে জমাদেয়া তথ্য হিসেবে স্বয়ংক্রিয়ভাবে বসানো হয়নি।' : 'Enter the values from the original deed or review OCR text for comparison. Database values are not copied into the submitted fields.'}
              </p>
            </div>
          )}

          <form onSubmit={handleVerify} noValidate className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label htmlFor="verify-deed-no" className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  {t('deedNo')} <span className="text-rose-500">*</span>
                </label>
                <Input
                  id="verify-deed-no"
                  type="text"
                  name="deed_no"
                  value={formData.deed_no}
                  onChange={handleChange}
                  maxLength={120}
                  placeholder={lang === 'bn' ? 'দলিল নম্বর লিখুন' : 'Enter the deed number'}
                  className={`gov-input ${fieldClass('deed_no')}`}
                  aria-invalid={Boolean(fieldErrors.deed_no)}
                  aria-describedby={fieldErrors.deed_no ? 'verify-deed-no-error' : undefined}
                  required
                />
                {fieldErrors.deed_no && <p id="verify-deed-no-error" className="mt-1 text-xs text-rose-600">{fieldErrors.deed_no}</p>}
              </div>

              <div>
                <label htmlFor="verify-reg-year" className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  {t('regYear')} <span className="text-rose-500">*</span>
                </label>
                <Input
                  id="verify-reg-year"
                  type="number"
                  name="reg_year"
                  value={formData.reg_year}
                  onChange={handleChange}
                  min="1950"
                  max={new Date().getFullYear()}
                  className={`gov-input ${fieldClass('reg_year')}`}
                  aria-invalid={Boolean(fieldErrors.reg_year)}
                  aria-describedby={fieldErrors.reg_year ? 'verify-reg-year-error' : undefined}
                  required
                />
                {fieldErrors.reg_year && <p id="verify-reg-year-error" className="mt-1 text-xs text-rose-600">{fieldErrors.reg_year}</p>}
              </div>
            </div>

            <div>
              <label htmlFor="verify-deed-type" className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                {lang === 'bn' ? 'দলিলের ধরন' : 'Deed type'} <span className="text-rose-500">*</span>
              </label>
              <LocationCombobox
                id="verify-deed-type"
                value={displayLocationName(deedTypes.find((item) => item.code === formData.deed_type), lang)}
                selectedKey={formData.deed_type}
                items={deedTypes.map((item) => ({ ...item, id: item.code }))}
                lang={lang}
                selectionOnly
                nativeSelect
                placeholder={lang === 'bn' ? 'দলিলের ধরন নির্বাচন করুন' : 'Select deed type'}
                emptyText={lang === 'bn' ? 'কোনো দলিলের ধরন মেলেনি।' : 'No deed types match this search.'}
                className={`gov-input ${fieldClass('deed_type')}`}
                aria-invalid={Boolean(fieldErrors.deed_type)}
                aria-describedby={fieldErrors.deed_type ? 'verify-deed-type-error' : undefined}
                required
                onTextChange={() => setFormData((previous) => ({ ...previous, deed_type: '' }))}
                onSelect={(selected) => {
                  setFormData((previous) => ({ ...previous, deed_type: selected.code }));
                  setFieldErrors((previous) => ({ ...previous, deed_type: undefined }));
                }}
              />
              {fieldErrors.deed_type && <p id="verify-deed-type-error" className="mt-1 text-xs text-rose-600">{fieldErrors.deed_type}</p>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="verify-division" className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">{lang === 'bn' ? 'বিভাগ' : 'Division'} <span className="text-rose-500">*</span></label>
                <LocationCombobox
                  id="verify-division"
                  value={displayLocationName(divisions.find((item) => String(item.id) === String(divisionId)), lang)}
                  selectedKey={divisionId}
                  items={divisions}
                  lang={lang}
                  selectionOnly
                  nativeSelect
                  placeholder={divisions.length ? (lang === 'bn' ? 'বিভাগ নির্বাচন করুন' : 'Select division') : (lang === 'bn' ? 'বিভাগের তথ্য পাওয়া যায়নি' : 'No divisions available')}
                  emptyText={lang === 'bn' ? 'কোনো বিভাগ মেলেনি।' : 'No divisions match this search.'}
                  className={`gov-input ${fieldClass('division_id')}`}
                  aria-invalid={Boolean(fieldErrors.division_id)}
                  aria-describedby={fieldErrors.division_id ? 'verify-division-error' : undefined}
                  required
                  onTextChange={() => {
                    setDivisionId(''); setDistrictId(''); setLocationId(''); setMouzaId('');
                    mouzaModeTouched.current = false; setMouzaMode('catalog'); setUnionId('');
                    setFormData((previous) => ({ ...previous, district: '', upazila: '', mouza: '', union_ward: '' }));
                    setFieldErrors((previous) => ({ ...previous, division_id: undefined, district_id: undefined, location_id: undefined }));
                  }}
                  onSelect={(selected) => {
                    setDivisionId(String(selected.id)); setDistrictId(''); setLocationId(''); setMouzaId('');
                    mouzaModeTouched.current = false; setMouzaMode('catalog'); setUnionId('');
                    setFormData((previous) => ({ ...previous, district: '', upazila: '', mouza: '', union_ward: '' }));
                    setFieldErrors((previous) => ({ ...previous, division_id: undefined, district_id: undefined, location_id: undefined }));
                  }}
                />
                {fieldErrors.division_id && <p className="mt-1 text-xs text-rose-600">{fieldErrors.division_id}</p>}
              </div>
              <div>
                <label htmlFor="verify-district" className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">{t('district')} <span className="text-rose-500">*</span></label>
                <LocationCombobox
                  id="verify-district"
                  value={formData.district}
                  selectedKey={districtId}
                  items={districts}
                  lang="bn"
                  disabled={!divisionId}
                  selectionOnly
                  nativeSelect
                  placeholder={!divisionId ? (lang === 'bn' ? 'আগে বিভাগ নির্বাচন করুন' : 'Select a division first') : (lang === 'bn' ? 'তালিকা থেকে জেলা বাছুন' : 'Choose a district from the list')}
                  emptyText={lang === 'bn' ? 'এই বিভাগে কোনো জেলা মেলেনি।' : 'No districts match this search.'}
                  className={`gov-input ${fieldClass('district_id')}`}
                  aria-invalid={Boolean(fieldErrors.district_id)}
                  aria-describedby={fieldErrors.district_id ? 'verify-district-error' : undefined}
                  required
                  onTextChange={() => {
                    setDistrictId('');
                    setLocationId('');
                    setMouzaId('');
                    mouzaModeTouched.current = false;
                    setMouzaMode('catalog');
                    setUnionId('');
                    setFormData((previous) => ({ ...previous, district: '', upazila: '', mouza: '', union_ward: '' }));
                    setFieldErrors((previous) => ({ ...previous, district_id: undefined, location_id: undefined, mouza: undefined }));
                  }}
                  onSelect={(selected) => {
                    setDistrictId(String(selected.id));
                    setLocationId('');
                    setMouzaId('');
                    mouzaModeTouched.current = false;
                    setMouzaMode('catalog');
                    setUnionId('');
                    setFormData((previous) => ({ ...previous, district: displayLocationName(selected, 'bn'), upazila: '', mouza: '', union_ward: '' }));
                    setFieldErrors((previous) => ({ ...previous, district_id: undefined, location_id: undefined, mouza: undefined }));
                  }}
                />
                {fieldErrors.district_id && <p id="verify-district-error" className="mt-1 text-xs text-rose-600">{fieldErrors.district_id}</p>}
              </div>
              <div>
                <label htmlFor="verify-location-type" className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">{lang === 'bn' ? 'এলাকার ধরন' : 'Location type'}</label>
                <LocationCombobox
                  id="verify-location-type"
                  selectedKey={locationType}
                  value={displayLocationName([
                    { id: 'upazila', code: 'upazila', name_bn: 'উপজেলা', name_en: 'Upazila' },
                    { id: 'police_thana', code: 'police_thana', name_bn: 'মেট্রোপলিটন থানা', name_en: 'Police Thana' },
                  ].find((item) => item.id === locationType), lang)}
                  items={[
                    { id: 'upazila', code: 'upazila', name_bn: 'উপজেলা', name_en: 'Upazila' },
                    { id: 'police_thana', code: 'police_thana', name_bn: 'মেট্রোপলিটন থানা', name_en: 'Police Thana' },
                  ]}
                  lang={lang}
                  selectionOnly
                  nativeSelect
                  placeholder={lang === 'bn' ? 'এলাকার ধরন নির্বাচন করুন' : 'Select location type'}
                  emptyText={lang === 'bn' ? 'কোনো এলাকার ধরন মেলেনি।' : 'No location types match this search.'}
                  className="gov-input"
                  aria-label={lang === 'bn' ? 'এলাকার ধরন' : 'Location type'}
                  onTextChange={() => {}}
                  onSelect={(selected) => {
                    setLocationType(selected.id); setLocationId(''); setMouzaId('');
                    mouzaModeTouched.current = false; setMouzaMode('catalog'); setUnionId('');
                    setFormData((previous) => ({ ...previous, upazila: '', mouza: '', union_ward: '' }));
                    setFieldErrors((previous) => ({ ...previous, location_id: undefined, mouza: undefined }));
                  }}
                />
              </div>
              <div>
                <label htmlFor="verify-upazila" className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">{locationType === 'upazila' ? t('upazila') : (lang === 'bn' ? 'থানা' : 'Police Thana')} <span className="text-rose-500">*</span></label>
                <LocationCombobox
                  id="verify-upazila"
                  value={formData.upazila}
                  selectedKey={locationId}
                  items={locations}
                  lang="bn"
                  disabled={!districtId}
                  selectionOnly
                  nativeSelect
                  placeholder={lang === 'bn' ? 'তালিকা থেকে বাছুন' : 'Choose from the list'}
                  emptyText={lang === 'bn' ? 'এই জেলায় কোনো নাম মেলেনি।' : 'No locations match this search.'}
                  className={`gov-input ${fieldClass('location_id')}`}
                  aria-invalid={Boolean(fieldErrors.location_id)}
                  aria-describedby={fieldErrors.location_id ? 'verify-upazila-error' : undefined}
                  required
                  onTextChange={() => {
                    setLocationId('');
                    setMouzaId('');
                    mouzaModeTouched.current = false;
                    setMouzaMode('catalog');
                    setUnionId('');
                    setFormData((previous) => ({ ...previous, upazila: '', mouza: '', union_ward: '' }));
                    setFieldErrors((previous) => ({ ...previous, location_id: undefined, mouza: undefined }));
                  }}
                  onSelect={(selected) => {
                    setLocationId(String(selected.id));
                    setMouzaId('');
                    mouzaModeTouched.current = false;
                    setMouzaMode('catalog');
                    setUnionId('');
                    setFormData((previous) => ({ ...previous, upazila: displayLocationName(selected, 'bn'), mouza: '', union_ward: '' }));
                    setFieldErrors((previous) => ({ ...previous, location_id: undefined, mouza: undefined }));
                  }}
                />
                {fieldErrors.location_id && <p id="verify-upazila-error" className="mt-1 text-xs text-rose-600">{fieldErrors.location_id}</p>}
              </div>
              <div>
                <label htmlFor="verify-mouza-manual" className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mt-3 mb-1">
                  {lang === 'bn' ? 'মৌজার নাম / জে.এল. নম্বর' : 'Mouza name / J.L. number'} <span className="text-rose-500">*</span>
                </label>
                <div className="mb-2 grid grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-900/50" role="group" aria-label={lang === 'bn' ? 'মৌজা দেওয়ার পদ্ধতি' : 'Mouza entry method'}>
                  <button
                    type="button"
                    disabled={!mouzas.length}
                    aria-pressed={mouzaMode === 'catalog'}
                    onClick={() => {
                      if (!mouzas.length) return;
                      mouzaModeTouched.current = true;
                      const selected = findLocationSuggestion(mouzas, formData.mouza, lang);
                      setMouzaMode('catalog');
                      setMouzaId(selected ? String(selected.id) : '');
                      setFormData((previous) => ({ ...previous, mouza: selected ? displayLocationName(selected, 'bn') : '' }));
                      setFieldErrors((previous) => ({ ...previous, mouza: undefined }));
                    }}
                    className={`rounded-lg px-2.5 py-2 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${mouzaMode === 'catalog' ? 'bg-white text-emerald-800 shadow-sm dark:bg-slate-800 dark:text-emerald-300' : 'text-slate-600 hover:bg-white/70 dark:text-slate-300 dark:hover:bg-slate-800/60'}`}
                  >
                    {lang === 'bn' ? 'তালিকা থেকে বাছুন' : 'Select from list'}
                  </button>
                  <button
                    type="button"
                    aria-pressed={mouzaMode === 'manual'}
                    onClick={() => {
                      mouzaModeTouched.current = true;
                      setMouzaMode('manual');
                      setMouzaId('');
                      setFieldErrors((previous) => ({ ...previous, mouza: undefined }));
                    }}
                    className={`rounded-lg px-2.5 py-2 text-xs font-semibold transition-colors ${mouzaMode === 'manual' ? 'bg-white text-emerald-800 shadow-sm dark:bg-slate-800 dark:text-emerald-300' : 'text-slate-600 hover:bg-white/70 dark:text-slate-300 dark:hover:bg-slate-800/60'}`}
                  >
                    {lang === 'bn' ? 'নাম হাতে লিখুন' : 'Enter manually'}
                  </button>
                </div>
                {mouzaMode === 'catalog' ? (
                  <LocationCombobox
                    id="verify-mouza-manual"
                    items={mouzas}
                    lang="bn"
                    value={formData.mouza}
                    selectedKey={mouzaId}
                    selectionOnly
                    nativeSelect
                    disabled={!locationId || !mouzas.length}
                    placeholder={mouzas.length
                      ? (lang === 'bn' ? 'তালিকা থেকে মৌজা বাছুন' : 'Choose a Mouza from the list')
                      : (lang === 'bn' ? 'যাচাইকৃত মৌজার তালিকা নেই' : 'No verified Mouza list available')}
                    emptyText={lang === 'bn' ? 'কোনো মৌজা মেলেনি—হাতে লেখার পদ্ধতি বেছে নিন।' : 'No Mouza found—switch to manual entry.'}
                    className={`gov-input ${fieldClass('mouza')}`}
                    aria-invalid={Boolean(fieldErrors.mouza)}
                    aria-describedby={fieldErrors.mouza ? 'verify-mouza-error' : undefined}
                    onTextChange={() => {
                      setMouzaId('');
                      setFormData((previous) => ({ ...previous, mouza: '' }));
                      setFieldErrors((previous) => ({ ...previous, mouza: undefined }));
                    }}
                    onSelect={(selected) => {
                      setMouzaId(String(selected.id));
                      setFormData((previous) => ({ ...previous, mouza: displayLocationName(selected, 'bn') }));
                      setFieldErrors((previous) => ({ ...previous, mouza: undefined }));
                    }}
                  />
                ) : (
                  <Input
                    id="verify-mouza-manual"
                    type="text"
                    name="mouza"
                    value={formData.mouza}
                    disabled={!locationId}
                    onChange={handleChange}
                    placeholder={lang === 'bn' ? 'দলিল অনুযায়ী মৌজার নাম বা জে.এল. নম্বর লিখুন' : 'Enter the Mouza name or J.L. number from the deed'}
                    className={`gov-input ${fieldClass('mouza')}`}
                    aria-invalid={Boolean(fieldErrors.mouza)}
                    aria-describedby={fieldErrors.mouza ? 'verify-mouza-error' : undefined}
                    required
                  />
                )}
                {fieldErrors.mouza && <p id="verify-mouza-error" className="mt-1 text-xs text-rose-600">{fieldErrors.mouza}</p>}
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  {mouzaMode === 'catalog' && mouzaId
                    ? (lang === 'bn' ? 'তালিকার মৌজা নির্বাচন করা হয়েছে; এটি মালিকানার সরকারি যাচাই নয়।' : 'A listed Mouza is selected; this does not verify legal ownership.')
                    : (lang === 'bn'
                      ? <>হাতে দেওয়া মৌজার নাম সরকারি তালিকায় যাচাই করা হয়নি। দলিল দেখে লিখুন; <a className="text-emerald-700 underline" href="https://settlement.gov.bd/Map/MapSearch" target="_blank" rel="noreferrer">DLRS মৌজা অনুসন্ধান</a> দেখুন।</>
                      : <>A manually entered Mouza is not verified against an official catalog. Check the deed and the <a className="text-emerald-700 underline" href="https://settlement.gov.bd/Map/MapSearch" target="_blank" rel="noreferrer">official DLRS Mouza search</a>.</>)}
                </p>
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="verify-union-ward" className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mt-3 mb-1">
                  {lang === 'bn' ? 'ইউনিয়ন / ওয়ার্ড (ঐচ্ছিক)' : 'Union / Ward (Optional)'}
                </label>
                <LocationCombobox
                  id="verify-union-ward"
                  value={formData.union_ward}
                  selectedKey={unionId}
                  items={unions}
                  lang="bn"
                  selectionOnly
                  nativeSelect
                  disabled={locationType !== 'upazila' || !locationId}
                  placeholder={locationType === 'upazila'
                    ? (lang === 'bn' ? 'তালিকা থেকে ইউনিয়ন বাছুন' : 'Choose a Union from the list')
                    : (lang === 'bn' ? 'এই থানার ওয়ার্ড তালিকা পাওয়া যায়নি' : 'No verified Ward list for this Thana')}
                  emptyText={lang === 'bn' ? 'এই উপজেলার জন্য সরকারি ইউনিয়ন তালিকা পাওয়া যায়নি।' : 'No official Union list is available for this Upazila.'}
                  className="gov-input"
                  onTextChange={() => {
                    setUnionId('');
                    setFormData((previous) => ({ ...previous, union_ward: '' }));
                  }}
                  onSelect={(selected) => {
                    setUnionId(String(selected.id));
                    setFormData((previous) => ({ ...previous, union_ward: displayLocationName(selected, 'bn') }));
                  }}
                />
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  {locationType === 'upazila' && unions.length
                    ? (lang === 'bn' ? 'শুধু তালিকাভুক্ত সরকারি ইউনিয়ন নির্বাচন করা যাবে; এটি ঐচ্ছিক।' : 'Only listed official Unions can be selected; this field is optional.')
                    : (lang === 'bn' ? 'সরকারি ওয়ার্ড তালিকা বা এই এলাকার ইউনিয়ন তালিকা নেই; তাই এখানে কোনো নাম হাতে যোগ করা যাবে না।' : 'No official Ward list, or no Union list for this area, is available; names cannot be added manually here.')}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="verify-plot-id" className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  {t('plotNo')} <span className="text-rose-500">*</span>
                </label>
                <Input
                  id="verify-plot-id"
                  type="text"
                  name="plot_id"
                  value={formData.plot_id}
                  onChange={handleChange}
                  placeholder={lang === 'bn' ? 'দাগ নম্বর লিখুন' : 'Enter the plot number'}
                  className={`gov-input ${fieldClass('plot_id')}`}
                  aria-invalid={Boolean(fieldErrors.plot_id)}
                  aria-describedby={fieldErrors.plot_id ? 'verify-plot-error' : undefined}
                  required
                />
                {fieldErrors.plot_id && <p id="verify-plot-error" className="mt-1 text-xs text-rose-600">{fieldErrors.plot_id}</p>}
              </div>

              <div>
                <label htmlFor="verify-khatian-no" className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  {t('khatianNo')} <span className="text-rose-500">*</span>
                </label>
                <Input
                  id="verify-khatian-no"
                  type="text"
                  name="khatian_no"
                  value={formData.khatian_no}
                  onChange={handleChange}
                  placeholder={lang === 'bn' ? 'খতিয়ান নম্বর লিখুন' : 'Enter the khatian number'}
                  className={`gov-input ${fieldClass('khatian_no')}`}
                  aria-invalid={Boolean(fieldErrors.khatian_no)}
                  aria-describedby={fieldErrors.khatian_no ? 'verify-khatian-error' : undefined}
                  required
                />
                {fieldErrors.khatian_no && <p id="verify-khatian-error" className="mt-1 text-xs text-rose-600">{fieldErrors.khatian_no}</p>}
              </div>

              <div>
                <label htmlFor="verify-owner-name" className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  {lang === 'bn' ? 'ক্রেতা / গ্রহীতার নাম' : 'Buyer / Transferee Name'} <span className="text-rose-500">*</span>
                </label>
                <Input
                  id="verify-owner-name"
                  type="text"
                  name="buyer_name"
                  value={formData.buyer_name}
                  onChange={handleChange}
                  placeholder={lang === 'bn' ? 'দলিলের ক্রেতা / গ্রহীতার নাম লিখুন' : 'Enter the deed buyer / transferee name'}
                  className={`gov-input ${fieldClass('buyer_name')}`}
                  aria-invalid={Boolean(fieldErrors.buyer_name)}
                  aria-describedby={fieldErrors.buyer_name ? 'verify-owner-error' : undefined}
                  required
                />
                {fieldErrors.buyer_name && <p id="verify-owner-error" className="mt-1 text-xs text-rose-600">{fieldErrors.buyer_name}</p>}
              </div>

              <div>
                <label htmlFor="verify-seller-name" className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  {lang === 'bn' ? 'বিক্রেতার নাম' : 'Seller name'} <span className="text-rose-500">*</span>
                </label>
                <Input
                  id="verify-seller-name"
                  type="text"
                  name="seller_name"
                  value={formData.seller_name}
                  onChange={handleChange}
                  placeholder={lang === 'bn' ? 'দলিলের বিক্রেতার নাম লিখুন' : 'Enter the seller name on the deed'}
                  className={`gov-input ${fieldClass('seller_name')}`}
                  aria-invalid={Boolean(fieldErrors.seller_name)}
                  aria-describedby={fieldErrors.seller_name ? 'verify-seller-error' : undefined}
                  required
                />
                {fieldErrors.seller_name && <p id="verify-seller-error" className="mt-1 text-xs text-rose-600">{fieldErrors.seller_name}</p>}
              </div>
            </div>

            <div>
              <label htmlFor="verify-notes" className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                {lang === 'bn' ? 'অতিরিক্ত মন্তব্য বা পর্যবেক্ষণ (ঐচ্ছিক)' : 'Additional Notes (Optional)'}
              </label>
              <Input as="textarea"
                id="verify-notes"
                name="notes"
                value={formData.notes}
                onChange={handleChange}
                rows="2"
                placeholder={lang === 'bn' ? 'যাচাই সম্পর্কিত কোনো বিশেষ তথ্য...' : 'Any special notes for review...'}
                className="gov-input resize-none"
              ></Input>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full gov-btn-primary justify-center text-xs py-3 font-bold shadow"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>{lang === 'bn' ? 'রেকর্ড খোঁজা হচ্ছে...' : 'Searching available records...'}</span>
                </>
              ) : (
                <>
                  <FileCheck2 className="w-4 h-4" />
                  <span>{lookupState === 'DEED_FOUND'
                    ? (lang === 'bn' ? 'দলিলের তথ্য যাচাই করুন' : 'Verify Deed Details')
                    : (lang === 'bn' ? 'দলিল নম্বর খুঁজে যাচাই শুরু করুন' : 'Find Deed and Start Verification')}</span>
                </>
              )}
            </Button>
          </form>
        </div>

        {/* Right 1 Col: Document Upload / OCR Extraction */}
        <div className="gov-card p-6 flex flex-col justify-between space-y-4">
          <div>
            <h2 className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-2 border-b border-gray-100 dark:border-gray-800 pb-2">
              <UploadCloud className="w-4 h-4 text-[#c59b27]" />
              <span>{lang === 'bn' ? '২. স্ক্যান দলিল আপলোড (OCR)' : '2. Scan Document Upload'}</span>
            </h2>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-2 leading-relaxed">
              {lang === 'bn'
                ? 'দলিলের PDF বা ছবি থেকে লেখা বের হবে। পাওয়া তথ্য ফর্মে দেখে নিয়ে প্রয়োজন হলে নিজে ঠিক করুন।'
                : 'Extract text from a deed PDF or image, then review and correct the form fields.'}
            </p>
          </div>

          <div
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                handleFileUpload(e.dataTransfer.files[0]);
              }
            }}
            className={`border-2 border-dashed rounded-xl p-6 text-center transition cursor-pointer ${
              dragActive
                ? 'border-[#0b462d] bg-emerald-50 dark:bg-emerald-950/40'
                : 'border-gray-300 dark:border-gray-700 hover:border-[#0b462d] bg-gray-50/50 dark:bg-gray-800/20'
            }`}
            onClick={() => document.getElementById('deed-file-input').click()}
          >
            <Input
              id="deed-file-input"
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleFileUpload(e.target.files[0]);
                }
              }}
            />
            <UploadCloud className="w-10 h-10 text-[#0b462d] dark:text-emerald-400 mx-auto mb-2" />
            <span className="text-xs font-semibold text-gray-800 dark:text-gray-200 block">
              {file ? file.name : (lang === 'bn' ? 'ফাইল নির্বাচন বা ড্রপ করুন' : 'Drop or Select File')}
            </span>
            <span className="text-[10px] text-gray-400 block mt-1">
              PDF, JPG, PNG (Max 10MB)
            </span>
          </div>

          <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-[11px] text-amber-800 dark:text-amber-300 leading-snug">
            <div className="flex items-start gap-1.5">
              <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span>
                {lang === 'bn'
                  ? 'স্বচ্ছতা নোট: searchable PDF থেকে সরাসরি টেক্সট পড়া হয়। স্ক্যান PDF ও ছবির OCR-এর জন্য backend-এ Tesseract এবং বাংলা/ইংরেজি language data লাগবে। OCR ফল নিজে মালিকানা যাচাই করে না।'
                  : 'Transparency notice: Searchable PDFs are read directly. Scanned PDFs and images require Tesseract with Bengali and English language data on the backend. OCR does not verify ownership.'}
              </span>
            </div>
          </div>
          {loading && operation === 'ocr' && (
            <div className="text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2" role="status">
              <RefreshCw className="w-4 h-4 animate-spin" />
              {lang === 'bn' ? 'ডকুমেন্ট থেকে লেখা পড়া হচ্ছে...' : 'Reading document text...'}
            </div>
          )}
          {ocrReview && (
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 space-y-2 text-xs">
              <div className="font-semibold text-slate-800 dark:text-slate-200">
                {lang === 'bn' ? 'OCR থেকে পাওয়া তথ্য—ফর্মে মিলিয়ে নিন' : 'OCR extraction — review before using'}
              </div>
              <p className="text-slate-600 dark:text-slate-300">{lang === 'bn' ? ocrReview.message_bn : ocrReview.message_en}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {Object.entries(ocrReview.extracted_fields || {}).filter(([key, value]) => key !== 'upazila_type' && value !== '' && value !== null && value !== undefined && !(key === 'owner_name' && value === ocrReview.extracted_fields?.buyer_name)).map(([key, value]) => (
                  <div key={key} className="rounded-md bg-white dark:bg-slate-800 p-2">
                    <div className="text-[10px] text-slate-500">{OCR_FIELD_LABELS[key]?.[lang === 'bn' ? 0 : 1] || key}</div>
                    <div className="font-medium text-slate-800 dark:text-slate-100 break-words">{String(value)}</div>
                  </div>
                ))}
              </div>
              {(ocrReview.location_mismatches || []).map((mismatch) => (
                <p key={mismatch.field} className="text-amber-800 dark:text-amber-300">
                  {lang === 'bn' ? mismatch.message_bn : mismatch.message_en}
                </p>
              ))}
              {(ocrReview.ocr_warnings || []).map((warning) => <p key={warning} className="text-amber-800 dark:text-amber-300">{warning}</p>)}
              {ocrReview.raw_text_preview && (
                <details open={ocrReview.recognized_field_count === 0}>
                  <summary className="cursor-pointer font-medium text-slate-700 dark:text-slate-200">{lang === 'bn' ? 'OCR-এ পড়া টেক্সট দেখুন' : 'View text read by OCR'}</summary>
                  <pre className="mt-2 whitespace-pre-wrap break-words text-[11px] text-slate-600 dark:text-slate-300">{ocrReview.raw_text_preview}</pre>
                </details>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
