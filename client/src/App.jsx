import { useEffect, useState } from 'react';

const API_BASE = '/api';

function App() {
  const [page, setPage] = useState('home');
  const [token, setToken] = useState(localStorage.getItem('gt_token') || '');
  const [alert, setAlert] = useState(null);
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState(null);
  const [profilePreferences, setProfilePreferences] = useState('');
  const [notifications, setNotifications] = useState([]);
  const [autocompleteQuery, setAutocompleteQuery] = useState('');
  const [autocompleteResults, setAutocompleteResults] = useState([]);
  const [adminUsers, setAdminUsers] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [recommendationFilters, setRecommendationFilters] = useState({ budget: '', location: '' });
  const [itineraries, setItineraries] = useState([]);
  const [searchFilters, setSearchFilters] = useState({
    q: '',
    tag: '',
    continent: '',
    maxCost: '',
  });
  const [searchResults, setSearchResults] = useState([]);
  const [suggestionFilters, setSuggestionFilters] = useState({ location: '', budget: '' });
  const [tripSuggestions, setTripSuggestions] = useState(null);
  const [groups, setGroups] = useState([]);
  const [selectedItinerary, setSelectedItinerary] = useState(null);
  const [shareUsername, setShareUsername] = useState('');
  const [sharePermission, setSharePermission] = useState('view');
  const [joinPaymentAmount, setJoinPaymentAmount] = useState('');
  const [mapInfo, setMapInfo] = useState(null);
  const [budgetInfo, setBudgetInfo] = useState(null);
  const [auditEntries, setAuditEntries] = useState([]);
  const [inviteForm, setInviteForm] = useState({ permission: 'view', maxUses: '1' });
  const [inviteResult, setInviteResult] = useState(null);
  const [checklistText, setChecklistText] = useState({});
  const [generatedItinerary, setGeneratedItinerary] = useState(null);
  const [generateForm, setGenerateForm] = useState({ location: '', budget: '', durationDays: '3', startDate: '' });
  const [progressForm, setProgressForm] = useState({
    status: 'in_progress',
    currentStageId: '',
    completedStageIds: '',
    currentLocation: '',
    progressPercent: '',
  });
  const [feedbackForm, setFeedbackForm] = useState({ rating: '5', comment: '', tags: '' });
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('mobile');
  const [paymentTargetType, setPaymentTargetType] = useState('total');
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [newDiscussionTitle, setNewDiscussionTitle] = useState('');
  const [newDiscussionMessage, setNewDiscussionMessage] = useState('');
  const [discussionReplies, setDiscussionReplies] = useState({});
  const [media, setMedia] = useState([]);
  const [newMediaUrl, setNewMediaUrl] = useState('');
  const [newMediaFile, setNewMediaFile] = useState(null);
  const [newMediaCaption, setNewMediaCaption] = useState('');
  const [newMediaType, setNewMediaType] = useState('photo');
  const [mediaGroupId, setMediaGroupId] = useState('');
  const [mediaComments, setMediaComments] = useState({});
  const [mediaShareTargets, setMediaShareTargets] = useState({});
  const [resources, setResources] = useState({ hotels: [], activities: [], places: [] });
  const [newResource, setNewResource] = useState({
    type: 'hotels',
    name: '',
    location: '',
    cost: '',
    description: '',
  });
  const [resourceReview, setResourceReview] = useState({ type: 'hotels', id: '', rating: '5', comment: '' });
  const [newItinerary, setNewItinerary] = useState({
    title: '',
    location: '',
    hotelName: '',
    hotelCost: '',
    activityName: '',
    activityCost: '',
    placeName: '',
    placeCost: '',
    startDate: '',
    endDate: '',
  });

  const navigate = (target) => {
    setAlert(null);
    setPage(target);
  };

  const fetchDashboardData = async () => {
    if (!token) {
      return;
    }

    setLoading(true);
    try {
      const [recoRes, itinRes, groupsRes, profileRes, notificationsRes] = await Promise.all([
        fetch(`${API_BASE}/recommendations?limit=4`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE}/itineraries`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE}/groups`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE}/profile`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE}/notifications`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (recoRes.ok) {
        setRecommendations(await recoRes.json());
      } else {
        setRecommendations([]);
      }

      if (itinRes.ok) {
        setItineraries(await itinRes.json());
      } else {
        setItineraries([]);
      }

      if (groupsRes.ok) {
        const groupsData = await groupsRes.json();
        setGroups(groupsData);
      } else {
        setGroups([]);
      }

      if (profileRes.ok) {
        const profileData = await profileRes.json();
        setProfile(profileData);
        setProfilePreferences((profileData.preferences || []).join(', '));
      }

      if (notificationsRes.ok) {
        setNotifications(await notificationsRes.json());
      } else {
        setNotifications([]);
      }

      const adminUsersRes = await fetch(`${API_BASE}/admin/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (adminUsersRes.ok) {
        setAdminUsers(await adminUsersRes.json());
      } else {
        setAdminUsers([]);
      }

      const mediaRes = await fetch(`${API_BASE}/media`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (mediaRes.ok) {
        setMedia(await mediaRes.json());
      } else {
        setMedia([]);
      }

      const [hotelsRes, activitiesRes, placesRes] = await Promise.all([
        fetch(`${API_BASE}/resources/hotels`),
        fetch(`${API_BASE}/resources/activities`),
        fetch(`${API_BASE}/resources/places`),
      ]);
      setResources({
        hotels: hotelsRes.ok ? await hotelsRes.json() : [],
        activities: activitiesRes.ok ? await activitiesRes.json() : [],
        places: placesRes.ok ? await placesRes.json() : [],
      });
    } catch (error) {
      setAlert({ type: 'error', message: 'Unable to load dashboard data.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (page === 'dashboard' && token) {
      fetchDashboardData();
    }
  }, [page, token]);

  const handleLogin = async (event) => {
    event.preventDefault();
    const form = event.target;
    const response = await fetch(`${API_BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: form.username.value,
        password: form.password.value,
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      setAlert({ type: 'error', message: result.error || 'Login failed' });
      return;
    }
    localStorage.setItem('gt_token', result.token);
    setToken(result.token);
    setAlert({ type: 'success', message: 'Login successful.' });
    setPage('dashboard');
  };

  const handleRegister = async (event) => {
    event.preventDefault();
    const form = event.target;
    const preferences = form.preferences.value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    const response = await fetch(`${API_BASE}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: form.username.value,
        password: form.password.value,
        preferences,
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      setAlert({ type: 'error', message: result.error || 'Registration failed' });
      return;
    }
    setAlert({ type: 'success', message: 'Account created. You can now login.' });
    setPage('login');
  };

  const handleLogout = () => {
    localStorage.removeItem('gt_token');
    setToken('');
    setPage('home');
    setRecommendations([]);
    setItineraries([]);
    setAlert({ type: 'success', message: 'Logged out successfully.' });
  };

  const handleDestinationSearch = async (event) => {
    event.preventDefault();

    const params = new URLSearchParams();
    if (searchFilters.q.trim()) params.set('q', searchFilters.q.trim());
    if (searchFilters.tag.trim()) params.set('tag', searchFilters.tag.trim());
    if (searchFilters.continent.trim()) params.set('continent', searchFilters.continent.trim());
    if (searchFilters.maxCost) params.set('max_cost', searchFilters.maxCost);

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/destinations?${params.toString()}`);
      if (!response.ok) {
        const result = await response.json();
        setAlert({ type: 'error', message: result.error || 'Destination search failed.' });
        setSearchResults([]);
        return;
      }
      setSearchResults(await response.json());
    } catch (error) {
      setAlert({ type: 'error', message: 'Unable to search destinations.' });
      setSearchResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAutocomplete = async (event) => {
    event.preventDefault();
    if (!autocompleteQuery.trim()) {
      setAutocompleteResults([]);
      return;
    }

    const response = await fetch(`${API_BASE}/autocomplete?q=${encodeURIComponent(autocompleteQuery.trim())}`);
    if (response.ok) {
      setAutocompleteResults(await response.json());
    } else {
      setAutocompleteResults([]);
    }
  };

  const handleUpdateProfile = async (event) => {
    event.preventDefault();
    if (!token) {
      setAlert({ type: 'error', message: 'Please login to update your profile.' });
      return;
    }

    const preferences = profilePreferences
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    const response = await fetch(`${API_BASE}/profile`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ preferences }),
    });
    const result = await response.json();
    if (!response.ok) {
      setAlert({ type: 'error', message: result.error || 'Unable to update profile.' });
      return;
    }
    setProfile(result.profile);
    setAlert({ type: 'success', message: 'Profile preferences updated.' });
    await fetchRecommendations();
  };

  const handleMarkNotificationRead = async (notificationId) => {
    const response = await fetch(`${API_BASE}/notifications/${notificationId}/read`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const result = await response.json();
    if (!response.ok) {
      setAlert({ type: 'error', message: result.error || 'Unable to update notification.' });
      return;
    }
    setNotifications((current) => current.map((item) => (item.id === notificationId ? result.notification : item)));
  };

  const fetchRecommendations = async (filters = recommendationFilters) => {
    if (!token) {
      return;
    }

    const params = new URLSearchParams({ limit: '4' });
    if (filters.budget) params.set('budget', filters.budget);
    if (filters.location.trim()) params.set('location', filters.location.trim());

    const response = await fetch(`${API_BASE}/recommendations?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.ok) {
      setRecommendations(await response.json());
    } else {
      setRecommendations([]);
    }
  };

  const handleFindTripSuggestions = async (event) => {
    event.preventDefault();
    if (!token) {
      setAlert({ type: 'error', message: 'Please login to get trip suggestions.' });
      return;
    }
    if (!suggestionFilters.location.trim()) {
      setAlert({ type: 'error', message: 'Location is required for suggestions.' });
      return;
    }

    const params = new URLSearchParams({
      location: suggestionFilters.location.trim(),
      budget: suggestionFilters.budget || '0',
    });

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/itineraries/suggestions?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json();
      if (!response.ok) {
        setAlert({ type: 'error', message: result.error || 'Unable to load trip suggestions.' });
        return;
      }
      setTripSuggestions(result);
    } catch (error) {
      setAlert({ type: 'error', message: 'Unable to load trip suggestions.' });
    } finally {
      setLoading(false);
    }
  };

  const handleFilterRecommendations = async (event) => {
    event.preventDefault();
    setLoading(true);
    try {
      await fetchRecommendations();
    } catch (error) {
      setAlert({ type: 'error', message: 'Unable to filter recommendations.' });
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateItinerary = async (event) => {
    event.preventDefault();
    if (!token) {
      setAlert({ type: 'error', message: 'Please login to generate an itinerary.' });
      return;
    }
    if (!generateForm.location.trim()) {
      setAlert({ type: 'error', message: 'Location is required.' });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/trips/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          location: generateForm.location.trim(),
          budget: Number(generateForm.budget) || 500,
          duration_days: Number(generateForm.durationDays) || 3,
          start_date: generateForm.startDate,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setAlert({ type: 'error', message: result.error || 'Unable to generate itinerary.' });
        return;
      }
      setGeneratedItinerary(result.generated_itinerary);
      setAlert({ type: 'success', message: 'Draft itinerary generated.' });
    } catch (error) {
      setAlert({ type: 'error', message: 'Unable to generate itinerary.' });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveGeneratedItinerary = async () => {
    if (!generatedItinerary) {
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/trips`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(generatedItinerary),
      });
      const result = await response.json();
      if (!response.ok) {
        setAlert({ type: 'error', message: result.error || 'Unable to save generated itinerary.' });
        return;
      }
      setItineraries((current) => [result, ...current]);
      setGeneratedItinerary(null);
      setAlert({ type: 'success', message: 'Generated itinerary saved.' });
    } catch (error) {
      setAlert({ type: 'error', message: 'Unable to save generated itinerary.' });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateItinerary = async (event) => {
    event.preventDefault();
    if (!token) {
      setAlert({ type: 'error', message: 'Please login to create an itinerary.' });
      return;
    }

    const title = newItinerary.title.trim();
    const location = newItinerary.location.trim();
    if (!title || !location) {
      setAlert({ type: 'error', message: 'Title and location are required.' });
      return;
    }

    setLoading(true);
    try {
      const payload = {
        title,
        location,
        hotel: newItinerary.hotelName.trim()
          ? {
              name: newItinerary.hotelName.trim(),
              cost_per_night: Number(newItinerary.hotelCost) || 0,
            }
          : {},
        activities: newItinerary.activityName.trim()
          ? [{ name: newItinerary.activityName.trim(), cost: Number(newItinerary.activityCost) || 0 }]
          : [],
        places_to_visit: newItinerary.placeName.trim()
          ? [{ name: newItinerary.placeName.trim(), cost: Number(newItinerary.placeCost) || 0 }]
          : [],
        start_date: newItinerary.startDate,
        end_date: newItinerary.endDate,
      };

      const response = await fetch(`${API_BASE}/itineraries`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();
      if (!response.ok) {
        setAlert({ type: 'error', message: result.error || 'Unable to create itinerary.' });
        return;
      }

      setItineraries((current) => [result, ...current]);
      setAlert({ type: 'success', message: 'Itinerary created successfully.' });
      setNewItinerary({
        title: '',
        location: '',
        hotelName: '',
        hotelCost: '',
        activityName: '',
        activityCost: '',
        placeName: '',
        placeCost: '',
        startDate: '',
        endDate: '',
      });
    } catch (error) {
      setAlert({ type: 'error', message: 'Unable to create itinerary.' });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateGroup = async (event) => {
    event.preventDefault();
    if (!token) {
      setAlert({ type: 'error', message: 'Please login to create a group.' });
      return;
    }

    const name = newGroupName.trim();
    if (!name) {
      setAlert({ type: 'error', message: 'Group name is required.' });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/groups`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name, description: newGroupDescription.trim() }),
      });

      const result = await response.json();
      if (!response.ok) {
        setAlert({ type: 'error', message: result.error || 'Unable to create group.' });
        return;
      }

      setGroups((current) => [result, ...current]);
      setAlert({ type: 'success', message: 'Group created successfully.' });
      setNewGroupName('');
      setNewGroupDescription('');
    } catch (error) {
      setAlert({ type: 'error', message: 'Unable to create group.' });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateDiscussion = async (event) => {
    event.preventDefault();
    if (!token || !selectedGroup) {
      setAlert({ type: 'error', message: 'Please login and select a group first.' });
      return;
    }

    const title = newDiscussionTitle.trim();
    const message = newDiscussionMessage.trim();
    if (!title || !message) {
      setAlert({ type: 'error', message: 'Both title and message are required.' });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/groups/${selectedGroup.id}/discussions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ title, message }),
      });

      const result = await response.json();
      if (!response.ok) {
        setAlert({ type: 'error', message: result.error || 'Unable to create discussion.' });
        return;
      }

      setSelectedGroup(result.group);
      setNewDiscussionTitle('');
      setNewDiscussionMessage('');
      setAlert({ type: 'success', message: 'Discussion thread created.' });
    } catch (error) {
      setAlert({ type: 'error', message: 'Unable to create discussion.' });
    } finally {
      setLoading(false);
    }
  };

  const handleReplyToDiscussion = async (groupId, discussionId, replyText) => {
    if (!token) {
      setAlert({ type: 'error', message: 'Please login to reply.' });
      return;
    }

    if (!replyText.trim()) {
      setAlert({ type: 'error', message: 'Reply text is required.' });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/groups/${groupId}/discussions/${discussionId}/reply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message: replyText }),
      });

      const result = await response.json();
      if (!response.ok) {
        setAlert({ type: 'error', message: result.error || 'Unable to post reply.' });
        return;
      }

      setSelectedGroup((current) => {
        if (!current) return current;
        return { ...current, discussions: current.discussions.map((discussion) => (
          discussion.id === discussionId ? result.discussion : discussion
        )) };
      });
      setDiscussionReplies((prev) => ({ ...prev, [discussionId]: '' }));
      setAlert({ type: 'success', message: 'Reply posted.' });
    } catch (error) {
      setAlert({ type: 'error', message: 'Unable to post reply.' });
    } finally {
      setLoading(false);
    }
  };

  const handleShareMedia = async (event) => {
    event.preventDefault();
    if (!token) {
      setAlert({ type: 'error', message: 'Please login to share media.' });
      return;
    }

    const url = newMediaUrl.trim();
    if (!url && !newMediaFile) {
      setAlert({ type: 'error', message: 'Media URL or file is required.' });
      return;
    }

    setLoading(true);
    try {
      let response;
      if (newMediaFile) {
        const formData = new FormData();
        formData.append('file', newMediaFile);
        formData.append('type', newMediaType);
        formData.append('caption', newMediaCaption.trim());
        if (mediaGroupId) formData.append('group_id', mediaGroupId);
        response = await fetch(`${API_BASE}/media/upload`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
      } else {
        response = await fetch(`${API_BASE}/media`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            type: newMediaType,
            url,
            caption: newMediaCaption.trim(),
            group_id: mediaGroupId || undefined,
          }),
        });
      }

      const result = await response.json();
      if (!response.ok) {
        setAlert({ type: 'error', message: result.error || 'Unable to share media.' });
        return;
      }

      setMedia((current) => [result, ...current]);
      setNewMediaUrl('');
      setNewMediaFile(null);
      setNewMediaCaption('');
      setNewMediaType('photo');
      setMediaGroupId('');
      setAlert({ type: 'success', message: 'Media shared successfully.' });
    } catch (error) {
      setAlert({ type: 'error', message: 'Unable to share media.' });
    } finally {
      setLoading(false);
    }
  };

  const handleJoinGroup = async (groupId) => {
    if (!token) {
      setAlert({ type: 'error', message: 'Please login to join a group.' });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/groups/${groupId}/join`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      const result = await response.json();
      if (!response.ok) {
        setAlert({ type: 'error', message: result.error || 'Unable to join group.' });
        return;
      }

      setAlert({ type: 'success', message: result.message || 'Joined group successfully.' });
      await fetchDashboardData();
    } catch (error) {
      setAlert({ type: 'error', message: 'Unable to join group.' });
    } finally {
      setLoading(false);
    }
  };

  const handleViewGroup = (group) => {
    setSelectedGroup(group);
    setPage('group');
  };

  const handleSelectItinerary = (itinerary) => {
    setSelectedItinerary(itinerary);
    setPaymentAmount('');
    setPaymentMethod('mobile');
    setPaymentTargetType('total');
    setShareUsername('');
    setJoinPaymentAmount('');
    setMapInfo(null);
    setBudgetInfo(null);
    setAuditEntries([]);
    setInviteResult(null);
    setProgressForm({
      status: itinerary.progress?.status || 'in_progress',
      currentStageId: itinerary.progress?.current_stage_id || '',
      completedStageIds: itinerary.progress?.completed_stage_ids?.join(', ') || '',
      currentLocation: itinerary.progress?.current_location || itinerary.location || '',
      progressPercent: itinerary.progress?.progress_percent?.toString() || '',
    });
    setPage('itinerary');
  };

  const refreshSelectedItinerary = (itinerary) => {
    setSelectedItinerary(itinerary);
    setItineraries((current) => current.map((item) => (item.id === itinerary.id ? itinerary : item)));
  };

  const handleShareItinerary = async (event) => {
    event.preventDefault();
    if (!token || !selectedItinerary) {
      setAlert({ type: 'error', message: 'Please login and select an itinerary first.' });
      return;
    }
    if (!shareUsername.trim()) {
      setAlert({ type: 'error', message: 'Enter a username to share with.' });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/itineraries/${selectedItinerary.id}/share`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ username: shareUsername.trim(), permission: sharePermission }),
      });
      const result = await response.json();
      if (!response.ok) {
        setAlert({ type: 'error', message: result.error || 'Unable to share itinerary.' });
        return;
      }
      refreshSelectedItinerary(result.itinerary);
      setShareUsername('');
      setSharePermission('view');
      setAlert({ type: 'success', message: result.message || 'Itinerary shared.' });
    } catch (error) {
      setAlert({ type: 'error', message: 'Unable to share itinerary.' });
    } finally {
      setLoading(false);
    }
  };

  const handleJoinItinerary = async (event) => {
    event.preventDefault();
    if (!token || !selectedItinerary) {
      setAlert({ type: 'error', message: 'Please login and select an itinerary first.' });
      return;
    }

    setLoading(true);
    try {
      const payload = joinPaymentAmount ? { payment_amount: Number(joinPaymentAmount), payment_method: paymentMethod } : {};
      const response = await fetch(`${API_BASE}/itineraries/${selectedItinerary.id}/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) {
        setAlert({ type: 'error', message: result.error || 'Unable to join itinerary.' });
        return;
      }
      refreshSelectedItinerary(result.itinerary);
      setJoinPaymentAmount('');
      setAlert({ type: 'success', message: result.message || 'Joined itinerary.' });
    } catch (error) {
      setAlert({ type: 'error', message: 'Unable to join itinerary.' });
    } finally {
      setLoading(false);
    }
  };

  const handleLoadMapInfo = async () => {
    if (!token || !selectedItinerary) {
      setAlert({ type: 'error', message: 'Please login and select an itinerary first.' });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/itineraries/${selectedItinerary.id}/map`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json();
      if (!response.ok) {
        setAlert({ type: 'error', message: result.error || 'Unable to load map metadata.' });
        return;
      }
      setMapInfo(result);
    } catch (error) {
      setAlert({ type: 'error', message: 'Unable to load map metadata.' });
    } finally {
      setLoading(false);
    }
  };

  const handleLoadBudget = async () => {
    if (!token || !selectedItinerary) return;
    const response = await fetch(`${API_BASE}/trips/${selectedItinerary.id}/budget`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.ok) {
      setBudgetInfo(await response.json());
    }
  };

  const handleLoadAudit = async () => {
    if (!token || !selectedItinerary) return;
    const response = await fetch(`${API_BASE}/trips/${selectedItinerary.id}/audit`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.ok) {
      setAuditEntries(await response.json());
    }
  };

  const handleCreateInvite = async (event) => {
    event.preventDefault();
    if (!token || !selectedItinerary) return;
    const response = await fetch(`${API_BASE}/trips/${selectedItinerary.id}/invite`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        permission: inviteForm.permission,
        max_uses: Number(inviteForm.maxUses) || 1,
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      setAlert({ type: 'error', message: result.error || 'Unable to create invite.' });
      return;
    }
    setInviteResult(result);
    setAlert({ type: 'success', message: 'Invite link created.' });
  };

  const handleDownloadItineraryFile = async (kind) => {
    if (!selectedItinerary) return;
    const path = kind === 'pdf' ? 'export.pdf' : 'calendar.ics';
    const response = await fetch(`${API_BASE}/trips/${selectedItinerary.id}/${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      setAlert({ type: 'error', message: 'Unable to download export.' });
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `itinerary-${selectedItinerary.id}.${kind === 'pdf' ? 'pdf' : 'ics'}`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleAddChecklistItem = async (stageId) => {
    const text = (checklistText[stageId] || '').trim();
    if (!text || !selectedItinerary) return;
    const response = await fetch(`${API_BASE}/trips/${selectedItinerary.id}/stages/${stageId}/checklist`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ text }),
    });
    const result = await response.json();
    if (!response.ok) {
      setAlert({ type: 'error', message: result.error || 'Unable to update checklist.' });
      return;
    }
    setSelectedItinerary((current) => ({
      ...current,
      stages: current.stages.map((stage) => (stage.id === stageId ? result.stage : stage)),
    }));
    setChecklistText((current) => ({ ...current, [stageId]: '' }));
  };

  const handleToggleChecklistItem = async (stageId, item) => {
    if (!selectedItinerary) return;
    const response = await fetch(`${API_BASE}/trips/${selectedItinerary.id}/stages/${stageId}/checklist`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ id: item.id, done: !item.done }),
    });
    const result = await response.json();
    if (response.ok) {
      setSelectedItinerary((current) => ({
        ...current,
        stages: current.stages.map((stage) => (stage.id === stageId ? result.stage : stage)),
      }));
    }
  };

  const handleUpdateProgress = async (event) => {
    event.preventDefault();
    if (!token || !selectedItinerary) {
      setAlert({ type: 'error', message: 'Please select an itinerary first.' });
      return;
    }

    const completedStageIds = progressForm.completedStageIds
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/trips/${selectedItinerary.id}/progress`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          status: progressForm.status,
          current_stage_id: progressForm.currentStageId || undefined,
          completed_stage_ids: completedStageIds,
          current_location: progressForm.currentLocation,
          progress_percent: progressForm.progressPercent ? Number(progressForm.progressPercent) : undefined,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setAlert({ type: 'error', message: result.error || 'Unable to update progress.' });
        return;
      }
      refreshSelectedItinerary(result.itinerary);
      setAlert({ type: 'success', message: 'Trip progress updated.' });
    } catch (error) {
      setAlert({ type: 'error', message: 'Unable to update progress.' });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitFeedback = async (event) => {
    event.preventDefault();
    if (!token || !selectedItinerary) {
      setAlert({ type: 'error', message: 'Please select an itinerary first.' });
      return;
    }

    const tags = feedbackForm.tags
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/trips/${selectedItinerary.id}/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          rating: Number(feedbackForm.rating),
          comment: feedbackForm.comment,
          tags,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setAlert({ type: 'error', message: result.error || 'Unable to submit feedback.' });
        return;
      }
      refreshSelectedItinerary(result.itinerary);
      setFeedbackForm({ rating: '5', comment: '', tags: '' });
      setAlert({ type: 'success', message: 'Feedback recorded.' });
      await fetchRecommendations();
    } catch (error) {
      setAlert({ type: 'error', message: 'Unable to submit feedback.' });
    } finally {
      setLoading(false);
    }
  };

  const handlePayItinerary = async (event) => {
    event.preventDefault();
    if (!token || !selectedItinerary) {
      setAlert({ type: 'error', message: 'Please login to complete payment.' });
      return;
    }

    const amount = Number(paymentAmount);
    if (!amount || amount <= 0) {
      setAlert({ type: 'error', message: 'Enter a valid payment amount.' });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/itineraries/${selectedItinerary.id}/pay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          amount,
          payment_method: paymentMethod,
          target_type: paymentTargetType,
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        setAlert({ type: 'error', message: result.error || 'Payment failed.' });
        return;
      }

      refreshSelectedItinerary(result.itinerary);
      setAlert({ type: 'success', message: 'Payment complete. Receipt generated.' });
    } catch (error) {
      setAlert({ type: 'error', message: 'Unable to process payment.' });
    } finally {
      setLoading(false);
    }
  };

  const handleLikeMedia = async (mediaId) => {
    if (!token) {
      setAlert({ type: 'error', message: 'Please login to like media.' });
      return;
    }
    const response = await fetch(`${API_BASE}/media/${mediaId}/like`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const result = await response.json();
    if (!response.ok) {
      setAlert({ type: 'error', message: result.error || 'Unable to like media.' });
      return;
    }
    setMedia((current) => current.map((item) => (item.id === mediaId ? result.media : item)));
  };

  const handleCommentMedia = async (mediaId) => {
    const comment = (mediaComments[mediaId] || '').trim();
    if (!comment) {
      setAlert({ type: 'error', message: 'Comment text is required.' });
      return;
    }

    const response = await fetch(`${API_BASE}/media/${mediaId}/comment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ comment }),
    });
    const result = await response.json();
    if (!response.ok) {
      setAlert({ type: 'error', message: result.error || 'Unable to comment on media.' });
      return;
    }
    setMedia((current) => current.map((item) => (item.id === mediaId ? result.media : item)));
    setMediaComments((current) => ({ ...current, [mediaId]: '' }));
  };

  const handleShareExistingMedia = async (mediaId) => {
    const username = (mediaShareTargets[mediaId] || '').trim();
    if (!username) {
      setAlert({ type: 'error', message: 'Enter a username to share media with.' });
      return;
    }

    const response = await fetch(`${API_BASE}/media/${mediaId}/share`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ username }),
    });
    const result = await response.json();
    if (!response.ok) {
      setAlert({ type: 'error', message: result.error || 'Unable to share media.' });
      return;
    }
    setMedia((current) => current.map((item) => (item.id === mediaId ? result.media : item)));
    setMediaShareTargets((current) => ({ ...current, [mediaId]: '' }));
    setAlert({ type: 'success', message: result.message || 'Media shared.' });
  };

  const handleCreateResource = async (event) => {
    event.preventDefault();
    if (!token) {
      setAlert({ type: 'error', message: 'Please login as an admin to manage resources.' });
      return;
    }

    const name = newResource.name.trim();
    const location = newResource.location.trim();
    const cost = Number(newResource.cost);
    if (!name || !location || Number.isNaN(cost)) {
      setAlert({ type: 'error', message: 'Name, location, and cost are required.' });
      return;
    }

    const isHotel = newResource.type === 'hotels';
    const payload = {
      name,
      location,
      description: newResource.description.trim(),
      [isHotel ? 'cost_per_night' : 'cost']: cost,
    };

    const response = await fetch(`${API_BASE}/resources/${newResource.type}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok) {
      setAlert({ type: 'error', message: result.error || 'Unable to create resource.' });
      return;
    }
    setResources((current) => ({
      ...current,
      [newResource.type]: [result, ...current[newResource.type]],
    }));
    setNewResource({ type: newResource.type, name: '', location: '', cost: '', description: '' });
    setAlert({ type: 'success', message: 'Resource created.' });
  };

  const handleDeleteResource = async (type, id) => {
    const response = await fetch(`${API_BASE}/resources/${type}/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    const result = await response.json();
    if (!response.ok) {
      setAlert({ type: 'error', message: result.error || 'Unable to delete resource.' });
      return;
    }
    setResources((current) => ({
      ...current,
      [type]: current[type].filter((item) => item.id !== id),
    }));
    setAlert({ type: 'success', message: result.message || 'Resource removed.' });
  };

  const handleUpdateUserRole = async (username, role) => {
    const response = await fetch(`${API_BASE}/admin/users/${username}/role`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ role }),
    });
    const result = await response.json();
    if (!response.ok) {
      setAlert({ type: 'error', message: result.error || 'Unable to update role.' });
      return;
    }
    setAdminUsers((current) => current.map((user) => (user.username === username ? { ...user, role } : user)));
  };

  const handleAddResourceReview = async (event) => {
    event.preventDefault();
    if (!resourceReview.id.trim()) {
      setAlert({ type: 'error', message: 'Resource ID is required for review.' });
      return;
    }
    const response = await fetch(`${API_BASE}/resources/${resourceReview.type}/${resourceReview.id.trim()}/reviews`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ rating: Number(resourceReview.rating), comment: resourceReview.comment }),
    });
    const result = await response.json();
    if (!response.ok) {
      setAlert({ type: 'error', message: result.error || 'Unable to add review.' });
      return;
    }
    setResources((current) => ({
      ...current,
      [resourceReview.type]: current[resourceReview.type].map((item) => (item.id === result.resource.id ? result.resource : item)),
    }));
    setResourceReview((current) => ({ ...current, id: '', comment: '', rating: '5' }));
    setAlert({ type: 'success', message: 'Review added.' });
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="container header-inner">
          <div className="brand">GlobeTrotter</div>
          <nav className="nav-bar">
            <button type="button" onClick={() => navigate('home')}>Home</button>
            {!token && <button type="button" onClick={() => navigate('login')}>Login</button>}
            {!token && <button type="button" onClick={() => navigate('register')}>Register</button>}
            {token && <button type="button" onClick={() => navigate('dashboard')}>Dashboard</button>}
            {token && <button type="button" onClick={handleLogout}>Logout</button>}
          </nav>
        </div>
      </header>

      <main className="container main-content">
        {alert && (
          <div className={`alert ${alert.type === 'success' ? 'alert-success' : 'alert-error'}`}>
            {alert.message}
          </div>
        )}

        {page === 'home' && (
          <section className="hero-section">
            <div className="hero-copy">
              <p className="eyebrow">Travel meets community</p>
              <h1>Plan trips, sell event tickets, and connect with travelers.</h1>
              <p>GlobeTrotter brings itineraries, payments, groups, and media sharing into one polished React experience.</p>
              <div className="hero-actions">
                <button type="button" className="button button-primary" onClick={() => navigate('register')}>Get Started</button>
                <button type="button" className="button button-secondary" onClick={() => navigate('login')}>Sign In</button>
              </div>
            </div>
            <div className="hero-cards">
              <article className="feature-card">
                <h3>Shared travel plans</h3>
                <p>Build itineraries together, invite friends, and track every booking.</p>
              </article>
              <article className="feature-card">
                <h3>Ticket monetization</h3>
                <p>Sell event tickets with receipts, commission tracking, and secure payment records.</p>
              </article>
              <article className="feature-card">
                <h3>Community feed</h3>
                <p>Post photos, comment, like, and reach travel groups with media sharing.</p>
              </article>
            </div>
          </section>
        )}

        {page === 'login' && (
          <section className="form-section">
            <div className="form-card">
              <h2>Sign in</h2>
              <form onSubmit={handleLogin}>
                <label>
                  Username
                  <input name="username" type="text" required />
                </label>
                <label>
                  Password
                  <input name="password" type="password" required />
                </label>
                <button type="submit" className="button button-primary">Login</button>
              </form>
              <p className="form-footnote">
                New here? <button type="button" className="link-button" onClick={() => navigate('register')}>Create an account</button>
              </p>
            </div>
          </section>
        )}

        {page === 'register' && (
          <section className="form-section">
            <div className="form-card">
              <h2>Create account</h2>
              <form onSubmit={handleRegister}>
                <label>
                  Username
                  <input name="username" type="text" required />
                </label>
                <label>
                  Password
                  <input name="password" type="password" required />
                </label>
                <label>
                  Interests
                  <input name="preferences" type="text" placeholder="beach, food, culture" />
                </label>
                <button type="submit" className="button button-primary">Register</button>
              </form>
              <p className="form-footnote">
                Already have an account? <button type="button" className="link-button" onClick={() => navigate('login')}>Login</button>
              </p>
            </div>
          </section>
        )}

        {page === 'dashboard' && token && (
          <section className="dashboard-section">
            <div className="grid-2">
              <div className="panel panel-primary">
                <h2>Welcome back</h2>
                <p>Access your itineraries, event receipts, and community groups in one place.</p>
                <div className="dashboard-actions">
                  <button type="button" className="button button-secondary" onClick={() => document.getElementById('create-itinerary')?.scrollIntoView({ behavior: 'smooth' })}>
                    Create itinerary
                  </button>
                  <button type="button" className="button button-secondary" onClick={() => document.getElementById('groups-panel')?.scrollIntoView({ behavior: 'smooth' })}>
                    Join a group
                  </button>
                </div>
              </div>
              <div className="panel">
                <h3>Quick links</h3>
                <ul>
                  <li>My itineraries</li>
                  <li>Destination recommendations</li>
                  <li>Group discussions</li>
                </ul>
              </div>
            </div>

            <div className="grid-3 mt-24">
              <div className="panel">
                <h3>Profile preferences</h3>
                <p className="small-text">{profile?.username || 'Signed in'} · {profile?.role || 'user'}</p>
                <form onSubmit={handleUpdateProfile} className="stacked-form">
                  <label>
                    Interests
                    <input
                      value={profilePreferences}
                      onChange={(event) => setProfilePreferences(event.target.value)}
                      placeholder="beach, food, culture"
                    />
                  </label>
                  <button type="submit" className="button button-secondary">Save preferences</button>
                </form>
              </div>
              <div className="panel">
                <h3>Notifications</h3>
                {notifications.length === 0 ? (
                  <p>No notifications yet.</p>
                ) : (
                  <ul className="list-card">
                    {notifications.slice(0, 4).map((notification) => (
                      <li key={notification.id}>
                        <strong>{notification.type}</strong>
                        <p>{notification.message}</p>
                        <p className="small-text">{notification.read ? 'Read' : 'Unread'}</p>
                        {!notification.read && (
                          <button type="button" className="button button-secondary" onClick={() => handleMarkNotificationRead(notification.id)}>
                            Mark read
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="panel">
                <h3>Place autocomplete</h3>
                <form onSubmit={handleAutocomplete} className="stacked-form">
                  <label>
                    Search catalogue
                    <input
                      value={autocompleteQuery}
                      onChange={(event) => setAutocompleteQuery(event.target.value)}
                      placeholder="Bali, surf, hotel"
                    />
                  </label>
                  <button type="submit" className="button button-secondary">Suggest</button>
                </form>
                {autocompleteResults.length > 0 && (
                  <ul className="list-card mt-16">
                    {autocompleteResults.map((item) => (
                      <li key={`${item.type}-${item.id}`}>
                        <strong>{item.name}</strong>
                        <p>{item.type} · {item.location}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="grid-3 mt-24">
              <div className="panel">
                <h3>Recent itineraries</h3>
                {loading ? (
                  <p>Loading...</p>
                ) : itineraries.length === 0 ? (
                  <p>No itineraries found yet.</p>
                ) : (
                  <ul className="list-card">
                    {itineraries.map((itinerary) => (
                      <li key={itinerary.id} className="itinerary-card">
                        <div>
                          <strong>{itinerary.title}</strong>
                          <p>{itinerary.location}</p>
                        </div>
                        <button type="button" className="button button-secondary" onClick={() => handleSelectItinerary(itinerary)}>
                          View
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="panel">
                <h3>Recommended destinations</h3>
                <form onSubmit={handleFilterRecommendations} className="stacked-form compact-form">
                  <label>
                    Budget
                    <input
                      type="number"
                      value={recommendationFilters.budget}
                      onChange={(event) => setRecommendationFilters((prev) => ({ ...prev, budget: event.target.value }))}
                      placeholder="100"
                    />
                  </label>
                  <label>
                    Location
                    <input
                      value={recommendationFilters.location}
                      onChange={(event) => setRecommendationFilters((prev) => ({ ...prev, location: event.target.value }))}
                      placeholder="Asia"
                    />
                  </label>
                  <button type="submit" className="button button-secondary">Filter</button>
                </form>
                {loading ? (
                  <p>Loading...</p>
                ) : recommendations.length === 0 ? (
                  <p>No recommendations available yet.</p>
                ) : (
                  <ul className="list-card">
                    {recommendations.map((item) => (
                      <li key={item.name}>
                        <strong>{item.name}</strong>
                        <p>{item.country}</p>
                        <p className="small-text">Match score: {item.match_score}</p>
                        {item.signals?.feedback_matches?.length > 0 && (
                          <p className="small-text">Feedback match: {item.signals.feedback_matches.join(', ')}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="panel" id="create-itinerary">
                <h3>Create itinerary</h3>
                <form onSubmit={handleCreateItinerary} className="stacked-form">
                  <label>
                    Title
                    <input
                      value={newItinerary.title}
                      onChange={(event) => setNewItinerary((prev) => ({ ...prev, title: event.target.value }))}
                      placeholder="Beach Escape"
                      required
                    />
                  </label>
                  <label>
                    Location
                    <input
                      value={newItinerary.location}
                      onChange={(event) => setNewItinerary((prev) => ({ ...prev, location: event.target.value }))}
                      placeholder="Bali"
                      required
                    />
                  </label>
                  <label>
                    Hotel name
                    <input
                      value={newItinerary.hotelName}
                      onChange={(event) => setNewItinerary((prev) => ({ ...prev, hotelName: event.target.value }))}
                      placeholder="Seaside Hotel"
                    />
                  </label>
                  <label>
                    Hotel cost
                    <input
                      type="number"
                      value={newItinerary.hotelCost}
                      onChange={(event) => setNewItinerary((prev) => ({ ...prev, hotelCost: event.target.value }))}
                      placeholder="120"
                    />
                  </label>
                  <label>
                    Activity name
                    <input
                      value={newItinerary.activityName}
                      onChange={(event) => setNewItinerary((prev) => ({ ...prev, activityName: event.target.value }))}
                      placeholder="Surf Lesson"
                    />
                  </label>
                  <label>
                    Activity cost
                    <input
                      type="number"
                      value={newItinerary.activityCost}
                      onChange={(event) => setNewItinerary((prev) => ({ ...prev, activityCost: event.target.value }))}
                      placeholder="50"
                    />
                  </label>
                  <label>
                    Place to visit
                    <input
                      value={newItinerary.placeName}
                      onChange={(event) => setNewItinerary((prev) => ({ ...prev, placeName: event.target.value }))}
                      placeholder="Uluwatu"
                    />
                  </label>
                  <label>
                    Place cost
                    <input
                      type="number"
                      value={newItinerary.placeCost}
                      onChange={(event) => setNewItinerary((prev) => ({ ...prev, placeCost: event.target.value }))}
                      placeholder="0"
                    />
                  </label>
                  <label>
                    Start date
                    <input
                      type="date"
                      value={newItinerary.startDate}
                      onChange={(event) => setNewItinerary((prev) => ({ ...prev, startDate: event.target.value }))}
                    />
                  </label>
                  <label>
                    End date
                    <input
                      type="date"
                      value={newItinerary.endDate}
                      onChange={(event) => setNewItinerary((prev) => ({ ...prev, endDate: event.target.value }))}
                    />
                  </label>
                  <button type="submit" className="button button-primary">Create itinerary</button>
                </form>
              </div>
            </div>
            <div className="panel mt-24">
              <h3>Generate itinerary draft</h3>
              <form onSubmit={handleGenerateItinerary} className="resource-form">
                <label>
                  Location
                  <input
                    value={generateForm.location}
                    onChange={(event) => setGenerateForm((prev) => ({ ...prev, location: event.target.value }))}
                    placeholder="Bali"
                    required
                  />
                </label>
                <label>
                  Budget
                  <input
                    type="number"
                    value={generateForm.budget}
                    onChange={(event) => setGenerateForm((prev) => ({ ...prev, budget: event.target.value }))}
                    placeholder="500"
                  />
                </label>
                <label>
                  Days
                  <input
                    type="number"
                    value={generateForm.durationDays}
                    onChange={(event) => setGenerateForm((prev) => ({ ...prev, durationDays: event.target.value }))}
                    min="1"
                    max="21"
                  />
                </label>
                <label>
                  Start date
                  <input
                    type="date"
                    value={generateForm.startDate}
                    onChange={(event) => setGenerateForm((prev) => ({ ...prev, startDate: event.target.value }))}
                  />
                </label>
                <button type="submit" className="button button-primary">Generate draft</button>
              </form>
              {generatedItinerary && (
                <div className="callout">
                  <strong>{generatedItinerary.title}</strong>
                  <p>{generatedItinerary.location} · {generatedItinerary.duration_days} days · ${generatedItinerary.cost_breakdown.total_budget}</p>
                  <p className="small-text">
                    {generatedItinerary.stages.map((stage) => stage.name).join(' · ')}
                  </p>
                  <button type="button" className="button button-secondary" onClick={handleSaveGeneratedItinerary}>
                    Save draft
                  </button>
                </div>
              )}
            </div>
            <div className="grid-2 mt-24">
              <div className="panel">
                <h3>Destination search</h3>
                <form onSubmit={handleDestinationSearch} className="search-form">
                  <label>
                    Search
                    <input
                      value={searchFilters.q}
                      onChange={(event) => setSearchFilters((prev) => ({ ...prev, q: event.target.value }))}
                      placeholder="Paris, Bali, beach"
                    />
                  </label>
                  <label>
                    Tag
                    <input
                      value={searchFilters.tag}
                      onChange={(event) => setSearchFilters((prev) => ({ ...prev, tag: event.target.value }))}
                      placeholder="food"
                    />
                  </label>
                  <label>
                    Continent
                    <input
                      value={searchFilters.continent}
                      onChange={(event) => setSearchFilters((prev) => ({ ...prev, continent: event.target.value }))}
                      placeholder="Asia"
                    />
                  </label>
                  <label>
                    Max daily cost
                    <input
                      type="number"
                      value={searchFilters.maxCost}
                      onChange={(event) => setSearchFilters((prev) => ({ ...prev, maxCost: event.target.value }))}
                      placeholder="120"
                    />
                  </label>
                  <button type="submit" className="button button-primary">Search</button>
                </form>
                {searchResults.length > 0 && (
                  <div className="search-results">
                    <h4>Results</h4>
                    <ul className="list-card">
                      {searchResults.map((dest) => (
                        <li key={dest.name}>
                          <strong>{dest.name}</strong>
                          <p>{dest.country} • {dest.continent}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              <div className="panel" id="groups-panel">
                <h3>Groups</h3>
                <form onSubmit={handleCreateGroup} className="stacked-form">
                  <label>
                    Group name
                    <input
                      value={newGroupName}
                      onChange={(event) => setNewGroupName(event.target.value)}
                      placeholder="Bali Travelers"
                      required
                    />
                  </label>
                  <label>
                    Description
                    <input
                      value={newGroupDescription}
                      onChange={(event) => setNewGroupDescription(event.target.value)}
                      placeholder="Share tips and meet other travellers"
                    />
                  </label>
                  <button type="submit" className="button button-primary">Create group</button>
                </form>
                {groups.length > 0 ? (
                  <ul className="list-card mt-16">
                    {groups.slice(0, 4).map((group) => (
                      <li key={group.id} className="group-card">
                        <div>
                          <strong>{group.name}</strong>
                          <p>{group.description}</p>
                        </div>
                        <div className="group-card-actions">
                          <button type="button" className="button button-secondary" onClick={() => handleJoinGroup(group.id)}>
                            Join
                          </button>
                          <button type="button" className="button button-tertiary" onClick={() => handleViewGroup(group)}>
                            View
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>No groups available yet.</p>
                )}
              </div>
            </div>
            <div className="grid-2 mt-24">
              <div className="panel">
                <h3>Trip suggestions</h3>
                <form onSubmit={handleFindTripSuggestions} className="search-form">
                  <label>
                    Location
                    <input
                      value={suggestionFilters.location}
                      onChange={(event) => setSuggestionFilters((prev) => ({ ...prev, location: event.target.value }))}
                      placeholder="Bali"
                      required
                    />
                  </label>
                  <label>
                    Budget
                    <input
                      type="number"
                      value={suggestionFilters.budget}
                      onChange={(event) => setSuggestionFilters((prev) => ({ ...prev, budget: event.target.value }))}
                      placeholder="300"
                    />
                  </label>
                  <button type="submit" className="button button-primary">Find matches</button>
                </form>
                {tripSuggestions && (
                  <div className="resource-columns mt-16">
                    {Object.entries(tripSuggestions.suggestions).map(([type, items]) => (
                      <div key={type}>
                        <h4>{type}</h4>
                        {items.length === 0 ? (
                          <p className="small-text">No matches yet.</p>
                        ) : (
                          <ul className="plain-list">
                            {items.map((item) => (
                              <li key={item.id || item.name}>{item.name}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="panel">
                <h3>Shared media feed</h3>
                {media.length === 0 ? (
                  <p>No media posts yet.</p>
                ) : (
                  <ul className="list-card media-feed">
                    {media.slice(0, 5).map((item) => (
                      <li key={item.id}>
                        <strong>{item.caption || item.url}</strong>
                        <p className="small-text">By {item.username} · {item.likes?.length || 0} likes · {item.comments?.length || 0} comments</p>
                        {item.type === 'photo' && <img src={item.url} alt={item.caption || 'Shared travel media'} />}
                        <div className="inline-actions">
                          <button type="button" className="button button-secondary" onClick={() => handleLikeMedia(item.id)}>Like</button>
                        </div>
                        <div className="inline-form">
                          <input
                            value={mediaComments[item.id] || ''}
                            onChange={(event) => setMediaComments((prev) => ({ ...prev, [item.id]: event.target.value }))}
                            placeholder="Add comment"
                          />
                          <button type="button" className="button button-secondary" onClick={() => handleCommentMedia(item.id)}>Comment</button>
                        </div>
                        <div className="inline-form">
                          <input
                            value={mediaShareTargets[item.id] || ''}
                            onChange={(event) => setMediaShareTargets((prev) => ({ ...prev, [item.id]: event.target.value }))}
                            placeholder="Share with username"
                          />
                          <button type="button" className="button button-secondary" onClick={() => handleShareExistingMedia(item.id)}>Share</button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <div className="panel mt-24">
              <h3>Resource management</h3>
              <form onSubmit={handleCreateResource} className="resource-form">
                <label>
                  Type
                  <select value={newResource.type} onChange={(event) => setNewResource((prev) => ({ ...prev, type: event.target.value }))}>
                    <option value="hotels">Hotel</option>
                    <option value="activities">Activity</option>
                    <option value="places">Place</option>
                  </select>
                </label>
                <label>
                  Name
                  <input value={newResource.name} onChange={(event) => setNewResource((prev) => ({ ...prev, name: event.target.value }))} required />
                </label>
                <label>
                  Location
                  <input value={newResource.location} onChange={(event) => setNewResource((prev) => ({ ...prev, location: event.target.value }))} required />
                </label>
                <label>
                  Cost
                  <input type="number" value={newResource.cost} onChange={(event) => setNewResource((prev) => ({ ...prev, cost: event.target.value }))} required />
                </label>
                <label>
                  Description
                  <input value={newResource.description} onChange={(event) => setNewResource((prev) => ({ ...prev, description: event.target.value }))} />
                </label>
                <button type="submit" className="button button-primary">Add resource</button>
              </form>
              <div className="resource-columns mt-16">
                {Object.entries(resources).map(([type, items]) => (
                  <div key={type}>
                    <h4>{type}</h4>
                    {items.length === 0 ? (
                      <p className="small-text">No entries.</p>
                    ) : (
                      <ul className="plain-list">
                        {items.slice(0, 6).map((item) => (
                          <li key={item.id}>
                            <span>{item.name}</span>
                            <button type="button" className="link-button" onClick={() => handleDeleteResource(type, item.id)}>Remove</button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
              <form onSubmit={handleAddResourceReview} className="resource-form mt-16">
                <label>
                  Review type
                  <select value={resourceReview.type} onChange={(event) => setResourceReview((prev) => ({ ...prev, type: event.target.value }))}>
                    <option value="hotels">Hotel</option>
                    <option value="activities">Activity</option>
                    <option value="places">Place</option>
                  </select>
                </label>
                <label>
                  Resource ID
                  <input value={resourceReview.id} onChange={(event) => setResourceReview((prev) => ({ ...prev, id: event.target.value }))} placeholder="hotel id" />
                </label>
                <label>
                  Rating
                  <select value={resourceReview.rating} onChange={(event) => setResourceReview((prev) => ({ ...prev, rating: event.target.value }))}>
                    <option value="5">5</option>
                    <option value="4">4</option>
                    <option value="3">3</option>
                    <option value="2">2</option>
                    <option value="1">1</option>
                  </select>
                </label>
                <label>
                  Comment
                  <input value={resourceReview.comment} onChange={(event) => setResourceReview((prev) => ({ ...prev, comment: event.target.value }))} />
                </label>
                <button type="submit" className="button button-secondary">Add review</button>
              </form>
              {adminUsers.length > 0 && (
                <div className="mt-16">
                  <h4>Admin users</h4>
                  <ul className="plain-list">
                    {adminUsers.map((user) => (
                      <li key={user.username}>
                        <span>{user.username} · {user.role}</span>
                        <select value={user.role} onChange={(event) => handleUpdateUserRole(user.username, event.target.value)}>
                          <option value="user">user</option>
                          <option value="admin">admin</option>
                        </select>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </section>
        )}

        {page === 'dashboard' && !token && (
          <div className="form-card">
            <h2>Please log in to view your dashboard.</h2>
          </div>
        )}

        {(page === 'itinerary' && selectedItinerary) || (page === 'group' && selectedGroup) ? (
          <section className="dashboard-section">
            <div className="panel panel-primary">
              <button type="button" className="link-button" onClick={() => setPage('dashboard')}>
                ← Back to dashboard
              </button>
              {page === 'itinerary' && selectedItinerary && (
                <>
                  <h2>{selectedItinerary.title}</h2>
                  <p>{selectedItinerary.location}</p>
                  <p>{selectedItinerary.notes}</p>
                </>
              )}
              {page === 'group' && selectedGroup && (
                <>
                  <h2>{selectedGroup.name}</h2>
                  <p>{selectedGroup.description}</p>
                  <p>
                    <strong>Members:</strong> {selectedGroup.members?.join(', ') || 'None'}
                  </p>
                </>
              )}
            </div>

            {page === 'itinerary' && selectedItinerary && (
              <>
                <div className="grid-2 mt-24">
                  <div className="panel">
                    <h3>Trip details</h3>
                    <p><strong>Owner:</strong> {selectedItinerary.username}</p>
                    <p><strong>Participants:</strong> {selectedItinerary.participants?.join(', ') || 'None'}</p>
                    <p><strong>Shared with:</strong> {selectedItinerary.shared_with?.join(', ') || 'Nobody yet'}</p>
                    <p><strong>Total budget:</strong> ${selectedItinerary.cost_breakdown?.total_budget || 0}</p>
                    <p><strong>Duration:</strong> {selectedItinerary.duration_days || 0} days · {selectedItinerary.duration_hours || 0} hours</p>
                    <p><strong>Progress:</strong> {selectedItinerary.progress?.progress_percent || 0}% · {selectedItinerary.progress?.status || 'not started'}</p>
                    <p><strong>Hotel:</strong> {selectedItinerary.hotel?.name || 'None'}</p>
                    <p><strong>Activities:</strong></p>
                    <ul>
                      {(selectedItinerary.activities || []).map((activity) => (
                        <li key={activity.name}>{activity.name} — ${activity.cost}</li>
                      ))}
                    </ul>
                    <p><strong>Places to visit:</strong></p>
                    <ul>
                      {(selectedItinerary.places_to_visit || []).map((place) => (
                        <li key={place.name}>{place.name} — ${place.cost}</li>
                      ))}
                    </ul>
                    {selectedItinerary.event_listing?.for_sale && (
                      <div className="callout">
                        <strong>Event tickets</strong>
                        <p>${selectedItinerary.event_listing.price_per_ticket} per ticket · {selectedItinerary.event_listing.seats_available ?? 'Unlimited'} seats left</p>
                      </div>
                    )}
                  </div>
                  <div className="panel">
                    <h3>Payment receipt</h3>
                    {selectedItinerary.receipts?.length > 0 ? (
                      <ul className="list-card">
                        {selectedItinerary.receipts.map((receipt) => (
                          <li key={receipt.id}>
                            <strong>{receipt.note || receipt.target_type}</strong>
                            <p>Amount: ${receipt.amount.toFixed(2)}</p>
                            <p>Commission: ${receipt.commission_amount.toFixed(2)}</p>
                            <p>Net: ${receipt.net_amount.toFixed(2)}</p>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>No payments recorded yet.</p>
                    )}
                  </div>
                </div>

                <div className="grid-2 mt-24">
                  <div className="panel">
                    <h3>Trip stages</h3>
                    {selectedItinerary.stages?.length > 0 ? (
                      <ul className="list-card">
                        {selectedItinerary.stages.map((stage) => (
                          <li key={stage.id}>
                            <strong>{stage.name}</strong>
                            <p>{stage.type} · {stage.duration_hours} hours · ${stage.cost}</p>
                            <p className="small-text">{stage.id} · {stage.status}</p>
                            {stage.map_info?.google_map_url && (
                              <a href={stage.map_info.google_map_url} target="_blank" rel="noreferrer">Open map</a>
                            )}
                            {(stage.checklist || []).map((item) => (
                              <label key={item.id} className="inline-check">
                                <input
                                  type="checkbox"
                                  checked={item.done}
                                  onChange={() => handleToggleChecklistItem(stage.id, item)}
                                />
                                {item.text}
                              </label>
                            ))}
                            <div className="inline-form">
                              <input
                                value={checklistText[stage.id] || ''}
                                onChange={(event) => setChecklistText((prev) => ({ ...prev, [stage.id]: event.target.value }))}
                                placeholder="Checklist item"
                              />
                              <button type="button" className="button button-secondary" onClick={() => handleAddChecklistItem(stage.id)}>Add</button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>No stages calculated yet.</p>
                    )}
                  </div>
                  <div className="panel">
                    <h3>Update progress</h3>
                    <form onSubmit={handleUpdateProgress} className="stacked-form">
                      <label>
                        Status
                        <select value={progressForm.status} onChange={(event) => setProgressForm((prev) => ({ ...prev, status: event.target.value }))}>
                          <option value="not_started">Not started</option>
                          <option value="in_progress">In progress</option>
                          <option value="completed">Completed</option>
                          <option value="delayed">Delayed</option>
                        </select>
                      </label>
                      <label>
                        Current stage
                        <select value={progressForm.currentStageId} onChange={(event) => setProgressForm((prev) => ({ ...prev, currentStageId: event.target.value }))}>
                          <option value="">Auto</option>
                          {(selectedItinerary.stages || []).map((stage) => (
                            <option key={stage.id} value={stage.id}>{stage.name}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Completed stage IDs
                        <input
                          value={progressForm.completedStageIds}
                          onChange={(event) => setProgressForm((prev) => ({ ...prev, completedStageIds: event.target.value }))}
                          placeholder="hotel, activity-1"
                        />
                      </label>
                      <label>
                        Current location
                        <input
                          value={progressForm.currentLocation}
                          onChange={(event) => setProgressForm((prev) => ({ ...prev, currentLocation: event.target.value }))}
                          placeholder="Airport"
                        />
                      </label>
                      <label>
                        Percent
                        <input
                          type="number"
                          value={progressForm.progressPercent}
                          onChange={(event) => setProgressForm((prev) => ({ ...prev, progressPercent: event.target.value }))}
                          min="0"
                          max="100"
                        />
                      </label>
                      <button type="submit" className="button button-primary">Update progress</button>
                    </form>
                  </div>
                </div>

                <div className="grid-3 mt-24">
                  <div className="panel">
                    <h3>Share itinerary</h3>
                    <form onSubmit={handleShareItinerary} className="stacked-form">
                      <label>
                        Username
                        <input
                          value={shareUsername}
                          onChange={(event) => setShareUsername(event.target.value)}
                          placeholder="bob"
                          required
                        />
                      </label>
                      <label>
                        Permission
                        <select value={sharePermission} onChange={(event) => setSharePermission(event.target.value)}>
                          <option value="view">View only</option>
                          <option value="edit">Can edit</option>
                        </select>
                      </label>
                      <button type="submit" className="button button-primary">Share</button>
                    </form>
                  </div>
                  <div className="panel">
                    <h3>Join itinerary</h3>
                    <form onSubmit={handleJoinItinerary} className="stacked-form">
                      <label>
                        Optional payment
                        <input
                          type="number"
                          value={joinPaymentAmount}
                          onChange={(event) => setJoinPaymentAmount(event.target.value)}
                          placeholder="75"
                        />
                      </label>
                      <button type="submit" className="button button-primary">Join trip</button>
                    </form>
                  </div>
                  <div className="panel">
                    <h3>Map metadata</h3>
                    <button type="button" className="button button-secondary" onClick={handleLoadMapInfo}>Load map</button>
                    {mapInfo && (
                      <div className="map-info">
                        <p><strong>Location:</strong> {mapInfo.location}</p>
                        {mapInfo.map_info?.google_map_url && (
                          <a href={mapInfo.map_info.google_map_url} target="_blank" rel="noreferrer">Open map</a>
                        )}
                        {mapInfo.map_info?.latitude && (
                          <p>{mapInfo.map_info.latitude}, {mapInfo.map_info.longitude}</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid-3 mt-24">
                  <div className="panel">
                    <h3>Invite link</h3>
                    <form onSubmit={handleCreateInvite} className="stacked-form">
                      <label>
                        Permission
                        <select value={inviteForm.permission} onChange={(event) => setInviteForm((prev) => ({ ...prev, permission: event.target.value }))}>
                          <option value="view">View only</option>
                          <option value="edit">Can edit</option>
                        </select>
                      </label>
                      <label>
                        Uses
                        <input type="number" min="1" value={inviteForm.maxUses} onChange={(event) => setInviteForm((prev) => ({ ...prev, maxUses: event.target.value }))} />
                      </label>
                      <button type="submit" className="button button-primary">Create invite</button>
                    </form>
                    {inviteResult && (
                      <p className="small-text">Token: {inviteResult.invite.token}</p>
                    )}
                  </div>
                  <div className="panel">
                    <h3>Budget and exports</h3>
                    <div className="inline-actions">
                      <button type="button" className="button button-secondary" onClick={handleLoadBudget}>Load budget</button>
                      <button type="button" className="button button-secondary" onClick={() => handleDownloadItineraryFile('ics')}>Calendar</button>
                      <button type="button" className="button button-secondary" onClick={() => handleDownloadItineraryFile('pdf')}>PDF</button>
                    </div>
                    {budgetInfo && (
                      <div className="map-info">
                        <p><strong>Planned:</strong> ${budgetInfo.planned_total}</p>
                        <p><strong>Paid:</strong> ${budgetInfo.paid_total}</p>
                        <p><strong>Remaining:</strong> ${budgetInfo.remaining_total}</p>
                      </div>
                    )}
                  </div>
                  <div className="panel">
                    <h3>Audit log</h3>
                    <button type="button" className="button button-secondary" onClick={handleLoadAudit}>Load audit</button>
                    {auditEntries.length > 0 && (
                      <ul className="list-card mt-16">
                        {auditEntries.slice(0, 5).map((entry) => (
                          <li key={entry.id}>
                            <strong>{entry.action}</strong>
                            <p className="small-text">{entry.username} · {entry.created_at}</p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>

                <div className="panel mt-24">
                  <h3>Make a payment</h3>
                  <form onSubmit={handlePayItinerary} className="stacked-form">
                    <label>
                      Amount
                      <input
                        type="number"
                        value={paymentAmount}
                        onChange={(event) => setPaymentAmount(event.target.value)}
                        placeholder="150"
                        required
                      />
                    </label>
                    <label>
                      Payment method
                      <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>
                        <option value="mobile">Mobile</option>
                        <option value="card">Card</option>
                      </select>
                    </label>
                    <label>
                      Target type
                      <select value={paymentTargetType} onChange={(event) => setPaymentTargetType(event.target.value)}>
                        <option value="total">Total</option>
                        <option value="share">Share</option>
                        <option value="event_ticket">Event ticket</option>
                      </select>
                    </label>
                    <button type="submit" className="button button-primary">Submit payment</button>
                  </form>
                </div>
                <div className="panel mt-24">
                  <h3>Trip feedback</h3>
                  <form onSubmit={handleSubmitFeedback} className="resource-form">
                    <label>
                      Rating
                      <select value={feedbackForm.rating} onChange={(event) => setFeedbackForm((prev) => ({ ...prev, rating: event.target.value }))}>
                        <option value="5">5</option>
                        <option value="4">4</option>
                        <option value="3">3</option>
                        <option value="2">2</option>
                        <option value="1">1</option>
                      </select>
                    </label>
                    <label>
                      Tags
                      <input
                        value={feedbackForm.tags}
                        onChange={(event) => setFeedbackForm((prev) => ({ ...prev, tags: event.target.value }))}
                        placeholder="beach, food"
                      />
                    </label>
                    <label>
                      Comment
                      <input
                        value={feedbackForm.comment}
                        onChange={(event) => setFeedbackForm((prev) => ({ ...prev, comment: event.target.value }))}
                        placeholder="What worked well?"
                      />
                    </label>
                    <button type="submit" className="button button-primary">Save feedback</button>
                  </form>
                  {selectedItinerary.feedback?.length > 0 && (
                    <ul className="list-card mt-16">
                      {selectedItinerary.feedback.map((feedback) => (
                        <li key={feedback.id}>
                          <strong>{feedback.rating}/5 by {feedback.username}</strong>
                          <p>{feedback.comment}</p>
                          <p className="small-text">{feedback.tags?.join(', ')}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}

            {page === 'group' && selectedGroup && (
              <>
                <div className="grid-2 mt-24">
                  <div className="panel">
                    <h3>Group discussions</h3>
                    <form onSubmit={handleCreateDiscussion} className="stacked-form compact-form">
                      <label>
                        New topic
                        <input
                          value={newDiscussionTitle}
                          onChange={(event) => setNewDiscussionTitle(event.target.value)}
                          placeholder="Best local guides"
                        />
                      </label>
                      <label>
                        Message
                        <input
                          value={newDiscussionMessage}
                          onChange={(event) => setNewDiscussionMessage(event.target.value)}
                          placeholder="Share a question or tip"
                        />
                      </label>
                      <button type="submit" className="button button-primary">Start discussion</button>
                    </form>
                    {selectedGroup.discussions?.length > 0 ? (
                      <ul className="list-card">
                        {selectedGroup.discussions.map((discussion) => (
                          <li key={discussion.id}>
                            <strong>{discussion.title}</strong>
                            <p>{discussion.posts[0]?.message}</p>
                            <div className="discussion-meta">
                              <span>{discussion.posts.length} posts</span>
                              <span>Started by {discussion.created_by}</span>
                            </div>
                            <div className="reply-box">
                              <input
                                type="text"
                                value={discussionReplies[discussion.id] || ''}
                                onChange={(event) => setDiscussionReplies((prev) => ({ ...prev, [discussion.id]: event.target.value }))}
                                placeholder="Write a reply"
                              />
                              <button
                                type="button"
                                className="button button-secondary"
                                onClick={() => handleReplyToDiscussion(selectedGroup.id, discussion.id, discussionReplies[discussion.id] || '')}
                              >
                                Reply
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>No discussions yet. Start the conversation below.</p>
                    )}
                  </div>
                  <div className="panel">
                    <h3>Share media with this group</h3>
                    <form onSubmit={handleShareMedia} className="stacked-form">
                      <label>
                        Media URL
                        <input
                          value={newMediaUrl}
                          onChange={(event) => setNewMediaUrl(event.target.value)}
                          placeholder="https://example.com/photo.jpg"
                        />
                      </label>
                      <label>
                        Upload file
                        <input
                          type="file"
                          accept="image/*,video/*"
                          onChange={(event) => setNewMediaFile(event.target.files?.[0] || null)}
                        />
                      </label>
                      <label>
                        Caption
                        <input
                          value={newMediaCaption}
                          onChange={(event) => setNewMediaCaption(event.target.value)}
                          placeholder="Sunset at the beach"
                        />
                      </label>
                      <label>
                        Type
                        <select value={newMediaType} onChange={(event) => setNewMediaType(event.target.value)}>
                          <option value="photo">Photo</option>
                          <option value="video">Video</option>
                        </select>
                      </label>
                      <label>
                        Group
                        <select value={mediaGroupId} onChange={(event) => setMediaGroupId(event.target.value)}>
                          <option value="">Public</option>
                          {groups.map((group) => (
                            <option key={group.id} value={group.id}>{group.name}</option>
                          ))}
                        </select>
                      </label>
                      <button type="submit" className="button button-primary">Share media</button>
                    </form>
                  </div>
                </div>
              </>
            )}
          </section>
        ) : null}
      </main>
    </div>
  );
}

export default App;
