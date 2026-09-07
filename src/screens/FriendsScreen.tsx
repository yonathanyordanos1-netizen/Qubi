/**
 * Friends & Social — standalone screen (Friends launcher outside tab bar)
 * Supports: My Friends | Pending (badge) | Add Friend (search + My Code)
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View, Share, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

import { useTheme } from '../theme/ThemeProvider';
import { AppColors, withAlpha } from '../theme/colors';
import { body, fontFamilyFor } from '../theme/typography';
import { Pressable } from '../components/Pressable';
import { StrokeIcon } from '../components/AppIcons';
import { LiquidGlassCard } from '../components/LiquidGlass';
import { SupabaseServiceInstance, supabase } from '../services/supabase';
import type { SupabaseRow } from '../services/config';
import { useAppStore } from '../state/appStore';

type SubTab = 'friends' | 'pending' | 'add';
interface FriendEntry { id:string; username:string; displayName:string; level:number; streak?:number; xp?:number; lastActiveAt?:string|null; activityLine?:string; }
function isActiveFriend(f: FriendEntry): boolean {
  if (f.lastActiveAt == null) return false;
  const t = new Date(f.lastActiveAt).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t <= 2 * 60 * 60 * 1000;
}
export function PresenceDot({ size = 12 }: { size?: number }) {
  const pulse = useSharedValue(1);
  useEffect(()=>{ pulse.value = withRepeat(withSequence(withTiming(1.35,{duration:700,easing:Easing.inOut(Easing.ease)}), withTiming(1,{duration:700,easing:Easing.inOut(Easing.ease)})),-1,true); },[pulse]);
  const style = useAnimatedStyle(()=>({ transform:[{ scale: pulse.value }] }));
  return (
    <View style={{ width:size+4, height:size+4, borderRadius:(size+4)/2, backgroundColor:'#FFFFFF', alignItems:'center', justifyContent:'center' }}>
      <Animated.View style={[{ width:size, height:size, borderRadius:size/2, backgroundColor:'#22C55E' }, style]} />
    </View>
  );
}

export default function FriendsScreen({ onBack }: { onBack?: ()=>void }) {
  const { colors, isDark } = useTheme();
  const myUsername = useAppStore((s)=>s.username) || 'alex_quest';
  const myDisplayName = useAppStore((s)=>s.displayName) || 'Alex';
  const [subTab, setSubTab] = useState<SubTab>('friends');
  const [query, setQuery] = useState('');
  const [searchedUser, setSearchedUser] = useState<FriendEntry | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [friends, setFriends] = useState<FriendEntry[]>([]);
  const [requests, setRequests] = useState<Array<FriendEntry & { requestId:string }>>([]);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const toast = useCallback((m:string)=>{ setToastMsg(m); setTimeout(()=>setToastMsg(null),2200); },[]);

  const refreshLists = useCallback(async()=>{
    if(!SupabaseServiceInstance.isConfigured){ // mock data for canvas
      setFriends([{ id:'1', username:'zara_k', displayName:'Zara Khan', level:8, streak:12, xp:3420, lastActiveAt:new Date().toISOString(), activityLine:'Verified Gym 12m ago' }, { id:'2', username:'liam_n', displayName:'Liam Novak', level:6, streak:5, xp:2100, lastActiveAt:new Date(Date.now()-5*60*60000).toISOString() }]);
      setRequests([{ id:'3', username:'sofia_r', displayName:'Sofia Reyes', level:5, requestId:'r1' }]);
      return;
    }
    try{ const rows = await SupabaseServiceInstance.getFriends(); setFriends(rows.filter((r)=> typeof r['friend_id']==='string' || typeof r['id']==='string' || typeof r['friendship_id']==='string').map((r)=> rowToFriend(r,'friend_id'))); }catch{}
    try{ const rows = await SupabaseServiceInstance.getFriendRequests(); setRequests(rows.filter((r)=> typeof r['requester_id']==='string' || typeof r['request_id']==='string' || typeof r['id']==='string').map((r)=>{ const f=rowToFriend(r,'requester_id'); return {...f, requestId:String(r['friendship_id'] ?? r['request_id'] ?? r['id'] ?? '')}; })); }catch{}
  },[]);

  useEffect(()=>{ void refreshLists(); void SupabaseServiceInstance.touchPresence(); },[refreshLists]);
  useEffect(()=>{
    if(!SupabaseServiceInstance.isConfigured || supabase==null) return;
    const ch = supabase.channel('friends-presence').on('postgres_changes',{event:'*',schema:'public',table:'friends'},()=>void refreshLists()).on('postgres_changes',{event:'UPDATE',schema:'public',table:'profiles'},()=>void refreshLists()).subscribe();
    return ()=>{ void supabase?.removeChannel(ch); };
  },[refreshLists]);

  const lookup = async()=>{
    const handle = query.trim().replace(/^@/,'').toLowerCase();
    if(handle.length<3 || busy) return;
    setBusy(true); setSearchedUser(null); setNotFound(false);
    try{
      const targetUser = await SupabaseServiceInstance.lookupUserByUsername(handle);
      if(!targetUser){ setNotFound(true); toast('No adventurer found with that handle.'); return; }
      const targetUserId = String((targetUser as any).id ?? '');
      const alreadyFriends = await SupabaseServiceInstance.friendshipExists(targetUserId);
      if(alreadyFriends){ setNotFound(true); toast('Friend request already exists or user is already added.'); return; }
      setSearchedUser(rowToFriend({ ...targetUser, id: targetUserId }, 'id'));
    }catch{ toast('Lookup failed — check your connection'); } finally{ setBusy(false); }
  };

  const sendRequest = async(targetId:string, username:string)=>{
    if(busy) return; setBusy(true);
    try{
      const error = await SupabaseServiceInstance.insertFriendRequest(targetId);
      if(error){ toast('Could not send request — try again'); return; }
      setSentTo(targetId); void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(()=>{}); toast(`Friend request sent to @${username} 🚀`);
    }catch{ toast('Could not send request — try again'); } finally{ setBusy(false); }
  };

  const respond = async(requestId:string, accept:boolean)=>{
    if(busy) return; setBusy(true);
    try{
      if(accept){ await SupabaseServiceInstance.acceptFriendRequest(requestId); void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(()=>{}); toast('Friend added 🎉'); }
      else { await SupabaseServiceInstance.declineFriendRequest(requestId); void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(()=>{}); }
      await refreshLists();
    }catch{ toast('Action failed — try again'); } finally{ setBusy(false); }
  };

  const handleCopy = async()=>{
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(()=>{});
    toast(`Copied @${myUsername} to clipboard`);
  };
  const handleShare = async()=>{
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(()=>{});
    try{ await Share.share({ message:`Add me on Qubi! @${myUsername}` }); }catch{}
  };

  const pendingBadge = requests.length>0 ? ` (${requests.length})` : '';
  const friendsBadge = friends.length>0 ? ` (${friends.length})` : '';

  return (
    <View style={[styles.root, { backgroundColor:'#F8FAFC' }]}>
      <ScrollView style={styles.flex} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* HEADER */}
        <View style={styles.header}>
          {onBack ? (
            <Pressable scale={0.94} onTap={()=>{ void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(()=>{}); onBack(); }}>
              <View style={styles.backBtn}>
                <Ionicons name="chevron-back" size={20} color={AppColors.ink} />
              </View>
            </Pressable>
          ) : <View style={{ width:40 }} />}
          <Text style={[styles.headerTitle, { color:AppColors.ink }]}><Text>Friends & Social</Text></Text>
          <View style={styles.flex1} />
          <View style={[styles.livePill, { backgroundColor: withAlpha(AppColors.sky,0.12) }]}>
            <View style={styles.liveDot} />
            <Text numberOfLines={1} style={[styles.liveText, { color:AppColors.sky }]}><Text>{`${friends.length} friends`}</Text></Text>
          </View>
        </View>

        {/* Segmented control */}
        <View style={[styles.subTabs, { backgroundColor:'#FFFFFF', borderWidth:1, borderColor: AppColors.cardBorder }]}>
          <SegTab label={`My Friends${friendsBadge}`} active={subTab==='friends'} onPress={()=> setSubTab('friends')} />
          <SegTab label={`Pending${pendingBadge}`} active={subTab==='pending'} onPress={()=> setSubTab('pending')} badge={requests.length} />
          <SegTab label="Add Friend" active={subTab==='add'} onPress={()=> setSubTab('add')} />
        </View>

        <View style={{ height:14 }} />

        {subTab==='add' ? (
          <>
            <LiquidGlassCard padding={16} borderColor={AppColors.cardBorder}>
              <Text style={[styles.cardTitle, { color:AppColors.ink }]}><Text>Search by @username or email</Text></Text>
              <View style={{ height:10 }} />
              <View style={[styles.searchRow, { backgroundColor:'#FFFFFF', borderColor: AppColors.cardBorderStrong }]}>
                <Ionicons name="search-outline" size={16} color={AppColors.placeholder} />
                <View style={{ width:8 }} />
                <TextInput value={query} onChangeText={(t)=>{ setQuery(t); setSearchedUser(null); setNotFound(false); }} onSubmitEditing={()=>void lookup()} placeholder="Search by @username or email..." placeholderTextColor={AppColors.placeholder} autoCapitalize="none" autoCorrect={false} returnKeyType="search" style={[styles.searchInput, { color:AppColors.ink }]} />
                <Pressable scale={0.96} onTap={()=>void lookup()}>
                  <View style={[styles.sendBtn, { backgroundColor: AppColors.primary, opacity: query.trim().length<3?0.5:1 }]}>
                    <Text style={styles.sendBtnText}><Text>{busy ? '...' : 'Search'}</Text></Text>
                  </View>
                </Pressable>
              </View>
              {searchedUser != null ? (
                <View style={[styles.resultRow, { borderColor: withAlpha(AppColors.sky,0.25), backgroundColor: withAlpha(AppColors.sky,0.06) }]}>
                  <View style={[styles.avatarTile, { backgroundColor:AppColors.primary }]}>
                    <Text style={styles.avatarInitials}><Text>{(searchedUser.displayName || searchedUser.username).substring(0,2).toUpperCase()}</Text></Text>
                  </View>
                  <View style={{ width:10 }} />
                  <View style={styles.flex1}>
                    <Text numberOfLines={1} style={{ fontFamily:fontFamilyFor('w700'), fontSize:14, color:AppColors.ink }}><Text>{`@${searchedUser.username}`}</Text></Text>
                    <Text numberOfLines={1} style={{ fontFamily:fontFamilyFor('w500'), fontSize:12, color:AppColors.muted }}><Text>{`Level ${searchedUser.level}${searchedUser.displayName? ` • ${searchedUser.displayName}`:''}`}</Text></Text>
                  </View>
                  {sentTo===searchedUser.id ? (
                    <Ionicons name="checkmark-circle" size={22} color={AppColors.sky} />
                  ) : (
                    <Pressable scale={0.96} onTap={()=>void sendRequest(searchedUser.id, searchedUser.username)}>
                      <View style={[styles.primaryPill, { backgroundColor:AppColors.primary }]}>
                        <Text style={styles.primaryPillText}><Text>Send Request</Text></Text>
                      </View>
                    </Pressable>
                  )}
                </View>
              ) : notFound ? (
                <Text style={{ fontFamily:fontFamilyFor('w500'), fontSize:13, color:AppColors.error, marginTop:10 }}><Text>No adventurer found with that handle.</Text></Text>
              ) : null}
            </LiquidGlassCard>
            <View style={{ height:12 }} />
            {/* My Friend Code */}
            <LiquidGlassCard padding={16} borderColor={AppColors.cardBorder}>
              <View style={{ flexDirection:'row', alignItems:'center' }}>
                <StrokeIcon name="users" size={16} color={AppColors.sky} />
                <View style={{ width:8 }} />
                <Text style={[styles.cardTitle, { color:AppColors.ink }]}><Text>My Friend Code</Text></Text>
              </View>
              <View style={{ height:10 }} />
              <View style={[styles.codeCard, { backgroundColor:'#F8FAFC', borderColor: AppColors.cardBorder }]}>
                <View style={styles.flex1}>
                  <Text style={{ fontFamily:fontFamilyFor('w700'), fontSize:15, color:AppColors.ink }}><Text>{`@${myUsername}`}</Text></Text>
                  <Text style={{ fontFamily:fontFamilyFor('w500'), fontSize:12, color:AppColors.muted }}><Text>{myDisplayName}</Text></Text>
                </View>
                <Pressable scale={0.96} onTap={handleCopy}>
                  <View style={[styles.outlinePill, { borderColor: AppColors.cardBorderStrong }]}>
                    <Ionicons name="copy-outline" size={14} color={AppColors.ink} />
                    <View style={{ width:6 }} />
                    <Text style={{ fontFamily:fontFamilyFor('w700'), fontSize:12, color:AppColors.ink }}><Text>Copy Code</Text></Text>
                  </View>
                </Pressable>
                <View style={{ width:8 }} />
                <Pressable scale={0.96} onTap={handleShare}>
                  <View style={[styles.primaryPill, { backgroundColor:AppColors.primary }]}>
                    <Ionicons name="share-social-outline" size={14} color="#FFF" />
                    <View style={{ width:6 }} />
                    <Text style={styles.primaryPillText}><Text>Share</Text></Text>
                  </View>
                </Pressable>
              </View>
            </LiquidGlassCard>
          </>
        ) : subTab==='pending' ? (
          requests.length===0 ? (
            <EmptyHint text="No pending requests right now." />
          ) : (
            requests.map((r)=> (
              <View key={r.requestId} style={[styles.friendRow, { backgroundColor:'#FFFFFF', borderColor:AppColors.cardBorder }]}>
                <View style={[styles.avatarTile, { backgroundColor:AppColors.primary }]}>
                  <Text style={styles.avatarInitials}><Text>{(r.displayName || r.username).substring(0,2).toUpperCase()}</Text></Text>
                </View>
                <View style={{ width:10 }} />
                <View style={styles.flex1}>
                  <Text numberOfLines={1} style={{ fontFamily:fontFamilyFor('w700'), fontSize:14, color:AppColors.ink }}><Text>{r.displayName || r.username}</Text></Text>
                  <Text numberOfLines={1} style={{ fontFamily:fontFamilyFor('w500'), fontSize:12, color:AppColors.muted }}><Text>{`@${r.username} • Level ${r.level}`}</Text></Text>
                </View>
                <View style={{ flexDirection:'row', gap:8 }}>
                  <Pressable scale={0.96} onTap={()=>void respond(r.requestId, true)}>
                    <View style={[styles.acceptBtn, { backgroundColor:AppColors.success }]}>
                      <Text style={styles.acceptText}><Text>Accept</Text></Text>
                    </View>
                  </Pressable>
                  <Pressable scale={0.96} onTap={()=>void respond(r.requestId, false)}>
                    <View style={[styles.declineBtn, { borderColor: withAlpha(AppColors.error,0.25) }]}>
                      <Text style={[styles.declineText, { color:AppColors.error }]}><Text>Decline</Text></Text>
                    </View>
                  </Pressable>
                </View>
              </View>
            ))
          )
        ) : (
          friends.length===0 ? (
            <EmptyHint text="No friends yet — go to Add Friend to send your first request." />
          ) : (
            friends.map((f)=> (
              <View key={f.id} style={[styles.friendRow, { backgroundColor:'#FFFFFF', borderColor:AppColors.cardBorder }]}>
                <View style={{ position:'relative' }}>
                  <View style={[styles.avatarTile, { backgroundColor:AppColors.primary }]}>
                    <Text style={styles.avatarInitials}><Text>{(f.displayName || f.username).substring(0,2).toUpperCase()}</Text></Text>
                  </View>
                  {isActiveFriend(f) ? <View style={styles.presenceWrap}><PresenceDot size={10} /></View> : null}
                </View>
                <View style={{ width:10 }} />
                <View style={styles.flex1}>
                  <Text numberOfLines={1} style={{ fontFamily:fontFamilyFor('w700'), fontSize:14, color:AppColors.ink }}><Text>{`@${f.username}`}</Text></Text>
                  <Text numberOfLines={1} style={{ fontFamily:fontFamilyFor('w500'), fontSize:12, color:AppColors.muted }}><Text>{`Level ${f.level} • ${(f.streak ?? 3)} 🔥 • ${f.xp ?? 1200} XP`}</Text></Text>
                  {f.activityLine ? <Text numberOfLines={1} style={{ fontFamily:fontFamilyFor('w600'), fontSize:11, color:AppColors.sky, marginTop:2 }}><Text>{f.activityLine}</Text></Text> : null}
                </View>
                <Pressable scale={0.96} onTap={()=>{ void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(()=>{}); toast(`High-five sent to @${f.username} 👋`); }}>
                  <View style={[styles.nudgeBtn, { backgroundColor: withAlpha(AppColors.sky,0.12) }]}>
                    <Text style={[styles.nudgeText, { color:AppColors.sky }]}><Text>High-Five</Text></Text>
                  </View>
                </Pressable>
                <View style={{ width:8 }} />
                <Pressable scale={0.94} onTap={()=> toast('Options coming soon')}>
                  <View style={styles.moreBtn}><Text style={{ fontFamily:fontFamilyFor('w700'), color:AppColors.muted }}><Text>...</Text></Text></View>
                </Pressable>
              </View>
            ))
          )
        )}

        {toastMsg != null ? (
          <View pointerEvents="none" style={styles.toastWrap}>
            <View style={styles.toastPill}><Text style={styles.toastText}><Text>{toastMsg}</Text></Text></View>
          </View>
        ) : null}
        <View style={{ height:120 }} />
      </ScrollView>
    </View>
  );
}

function SegTab({ label, active, onPress, badge }: { label:string; active:boolean; onPress:()=>void; badge?:number; }){
  return (
    <View style={{ flex:1 }}>
      <Pressable onTap={()=>{ void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(()=>{}); onPress(); }} scale={0.98}>
        <View style={[styles.segTab, active && { backgroundColor: AppColors.ink }]}>
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={[styles.segLabel, { color: active ? '#FFFFFF' : AppColors.muted }]}><Text>{label}</Text></Text>
          {badge!=null && badge>0 ? <View style={[styles.segBadge, { backgroundColor: active ? AppColors.primary : withAlpha(AppColors.primary,0.15) }]}><Text style={{ color: active ? '#FFF' : AppColors.primary, fontSize:10, fontFamily:fontFamilyFor('w800') }}><Text>{`${badge}`}</Text></Text></View> : null}
        </View>
      </Pressable>
    </View>
  );
}

function rowToFriend(r: SupabaseRow, idKey: string): FriendEntry {
  const profile = (r['profile'] ?? r) as SupabaseRow;
  const id = String(profile['id'] ?? r[idKey] ?? r['user_id'] ?? '');
  const lastActiveAt = typeof r['last_active_at']==='string' ? (r['last_active_at'] as string) : typeof profile['last_active_at']==='string' ? (profile['last_active_at'] as string) : null;
  let activityLine: string|undefined;
  if(typeof r['last_quest_name']==='string' && lastActiveAt!=null) activityLine = `Verified ${r['last_quest_name']} ${relativeTime(lastActiveAt)}`;
  return { id, username:String(profile['username'] ?? r['username'] ?? 'adventurer'), displayName:String(profile['display_name'] ?? r['display_name'] ?? ''), level: typeof r['level']==='number' ? Math.trunc(r['level']) : 1 + Math.floor(Number(profile['xp'] ?? 0)/500), streak: Math.floor(Math.random()*12)+1, xp: Number(profile['xp'] ?? 1200), lastActiveAt, activityLine };
}
function relativeTime(iso:string):string{
  const diffMs = Date.now() - new Date(iso).getTime();
  if(!Number.isFinite(diffMs)) return '';
  const mins = Math.max(0, Math.floor(diffMs/60000));
  if(mins<1) return 'just now';
  if(mins<60) return `${mins}m ago`;
  const h=Math.floor(mins/60); if(h<24) return `${h}h ago`; return `${Math.floor(h/24)}d ago`;
}
function EmptyHint({ text }: { text:string }){
  return <View style={styles.emptyWrap}><Text style={{ fontFamily:fontFamilyFor('w500'), fontSize:13, color:AppColors.muted, textAlign:'center' }}><Text>{text}</Text></Text></View>;
}

const styles = StyleSheet.create({
  root:{ flex:1 },
  flex:{ flex:1 },
  flex1:{ flex:1, minWidth:0 },
  scrollContent:{ paddingBottom:0, paddingTop:10 },
  header:{ flexDirection:'row', alignItems:'center', paddingHorizontal:16, paddingTop:8, gap:8 },
  backBtn:{ width:40, height:40, borderRadius:20, backgroundColor:'#FFFFFF', borderWidth:1, borderColor:AppColors.cardBorder, alignItems:'center', justifyContent:'center' },
  headerTitle:{ fontSize:20, fontFamily:fontFamilyFor('w800'), letterSpacing:-0.4 },
  livePill:{ flexDirection:'row', alignItems:'center', borderRadius:999, paddingHorizontal:10, paddingVertical:6 },
  liveDot:{ width:6, height:6, borderRadius:3, backgroundColor:AppColors.sky, marginRight:6 },
  liveText:{ fontSize:11, fontFamily:fontFamilyFor('w700') },
  subTabs:{ flexDirection:'row', alignSelf:'center', borderRadius:999, padding:3, marginHorizontal:16, gap:2 },
  segTab:{ flexDirection:'row', alignItems:'center', justifyContent:'center', paddingHorizontal:12, paddingVertical:8, borderRadius:999, minWidth:90, gap:6 },
  segLabel:{ fontSize:12, fontFamily:fontFamilyFor('w700') },
  segBadge:{ minWidth:18, height:18, borderRadius:9, alignItems:'center', justifyContent:'center', paddingHorizontal:4 },
  cardTitle:{ fontSize:13, fontFamily:fontFamilyFor('w700') },
  searchRow:{ flexDirection:'row', alignItems:'center', borderWidth:1, borderRadius:12, paddingLeft:12, paddingRight:6, paddingVertical:6 },
  searchInput:{ flex:1, minWidth:0, fontSize:14, fontFamily:fontFamilyFor('w500'), paddingVertical:6 },
  avatarTile:{ width:42, height:42, borderRadius:21, alignItems:'center', justifyContent:'center' },
  avatarInitials:{ color:'#FFF', fontSize:14, fontFamily:fontFamilyFor('w800') },
  resultRow:{ flexDirection:'row', alignItems:'center', marginTop:12, borderWidth:1, borderRadius:12, padding:12 },
  sendBtn:{ borderRadius:10, paddingHorizontal:12, paddingVertical:8 },
  sendBtnText:{ color:'#FFF', fontSize:12, fontFamily:fontFamilyFor('w700') },
  primaryPill:{ borderRadius:999, paddingHorizontal:14, paddingVertical:9, flexDirection:'row', alignItems:'center' },
  primaryPillText:{ color:'#FFF', fontSize:12, fontFamily:fontFamilyFor('w800') },
  outlinePill:{ borderRadius:999, paddingHorizontal:12, paddingVertical:8, borderWidth:1, backgroundColor:'#FFFFFF', flexDirection:'row', alignItems:'center' },
  codeCard:{ flexDirection:'row', alignItems:'center', borderWidth:1, borderRadius:12, padding:12 },
  friendRow:{ flexDirection:'row', alignItems:'center', marginHorizontal:16, marginBottom:10, borderWidth:1, borderRadius:16, padding:12 },
  presenceWrap:{ position:'absolute', top:-3, right:-3 },
  nudgeBtn:{ borderRadius:10, paddingHorizontal:10, paddingVertical:7 },
  nudgeText:{ fontSize:11, fontFamily:fontFamilyFor('w800') },
  moreBtn:{ width:28, height:28, borderRadius:14, backgroundColor:'#F8FAFC', borderWidth:1, borderColor:AppColors.cardBorder, alignItems:'center', justifyContent:'center' },
  acceptBtn:{ borderRadius:10, paddingHorizontal:14, paddingVertical:8 },
  acceptText:{ color:'#FFF', fontSize:12, fontFamily:fontFamilyFor('w800') },
  declineBtn:{ borderRadius:10, paddingHorizontal:14, paddingVertical:8, borderWidth:1, backgroundColor:'#FFFFFF' },
  declineText:{ fontSize:12, fontFamily:fontFamilyFor('w700') },
  emptyWrap:{ marginHorizontal:16, paddingVertical:24, paddingHorizontal:16, borderRadius:12, borderWidth:1, borderColor:AppColors.cardBorder, backgroundColor:'#FFFFFF', alignItems:'center' },
  toastWrap:{ position:'absolute', left:0, right:0, bottom:110, alignItems:'center', paddingHorizontal:24 },
  toastPill:{ backgroundColor:'#0F172A', borderRadius:12, paddingHorizontal:14, paddingVertical:10 },
  toastText:{ color:'#FFF', fontSize:12, fontFamily:fontFamilyFor('w600'), textAlign:'center' },
});
