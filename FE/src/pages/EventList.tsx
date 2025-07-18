import React, { useEffect, useState } from 'react';
import Layout from '../components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import { LayoutList, LayoutGrid } from "lucide-react";
import EventGrid from "@/components/pages/events/EventGrid";
import EventListLayout from "@/components/pages/events/EventListLayout";
import { TagService, EventService, UserService } from "@/api/services";
import { type ErrorResponse } from '@/types';
import type { GetTagsResponseDto, PaginationResponseDto , GetEventResponseDto, GetFullEventResponseDto, PaginationQueryDto } from "@/types/dtos";
import { PagesRoutesConstants, ToastVariantsConstants } from '@/utils/constants';
import { TranslationConstants } from '@/utils/constants';
import { useToast } from '@/hooks/useToast';
import { useTranslation } from 'react-i18next';
import { useLanguageChange } from '@/hooks/useLanguageChange';
import { useAuthChange } from '@/hooks/useAuthChange';
import { useSkipReset } from '@/context';
import { useAppSelector } from '@/store';
import { useNavigate } from 'react-router-dom';
import { useDebounce } from '@/hooks/useDebounce';

const DEFAULT_SELECTED_CATEGORY = "all";

const EventList: React.FC = () => {
  const [ isLoadingEvents, setIsLoadingEvents ] = useState(false);
  const [ isLoadingTags, setIsLoadingTags ] = useState(false);
  const [ pagination, setPagination ] = useState<PaginationQueryDto>({
    page: -1,
    limit: 12,
  });
  const [ tags, setTags ] = useState<GetTagsResponseDto>([]);
  const [events, setEvents] = useState<PaginationResponseDto<GetEventResponseDto | GetFullEventResponseDto>>();
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 500);
  const [selectedCategory, setSelectedCategory] = useState(DEFAULT_SELECTED_CATEGORY);
  const [isGrid, setIsGrid] = useState(false);
  const { toast } = useToast();
  const { t } = useTranslation();
  const { skipNextReset, setSkipNextReset, pendingBookingEventId, setPendingBookingEventId } = useSkipReset();
  const { isLoginModalOpen, user } = useAppSelector(state => state.auth);
  const navigate = useNavigate();
  
  const resetPage = () => {
    setPagination({ page: -1, limit: 12 });
    setEvents(undefined);
  }

  useLanguageChange(() => {
    resetPage();
    setTags([]);
  });

  useAuthChange(() => {
    if (skipNextReset && pendingBookingEventId) {
      setSkipNextReset(false);
      handleBooking(pendingBookingEventId);
      return;
    }
    setPendingBookingEventId(null);
    resetPage();
  });

  const handleBooking = async (eventId: string) => {
    try {
      await UserService.bookEvent(eventId);
      toast({
        title: t(TranslationConstants.EVENTS.BOOK_EVENT_SUCCESS),
        description: t(TranslationConstants.EVENTS.BOOK_EVENT_SUCCESS),
        variant: ToastVariantsConstants.SUCCESS,
      });
      setSkipNextReset(false);
      setPendingBookingEventId(null);
      navigate(`${PagesRoutesConstants.EVENTS}/${eventId}`);
    } catch (error) {
      const errorResponse : ErrorResponse = error as ErrorResponse;
      toast({
        title: t(TranslationConstants.COMMON.MESSAGES.ERROR),
        description: errorResponse.response?.data?.message || t(TranslationConstants.EVENTS.GET_EVENTS_FAILED),
        variant: ToastVariantsConstants.ERROR,
      });
      setSkipNextReset(false);
      setPendingBookingEventId(null);
    }
  }
  

  // if the modal closed without login
  useEffect(() => {
    if (!isLoginModalOpen && !user) {
      setSkipNextReset(false);
      setPendingBookingEventId(null);
    }
  }, [isLoginModalOpen, user]);

  // fetch tags
  useEffect(() => {
    const fetchTags = async () => {
      setIsLoadingTags(true);
      try {
        const tags = await TagService.getTags() as GetTagsResponseDto;
        setTags(tags);
      } catch (error) {
        const errorResponse : ErrorResponse = error as ErrorResponse;
        toast({
            title: t(TranslationConstants.COMMON.MESSAGES.ERROR),
            description: errorResponse.response?.data?.message || t(TranslationConstants.EVENTS.GET_EVENTS_FAILED),
            variant: ToastVariantsConstants.ERROR,
        });
      } finally {
        setIsLoadingTags(false);
      }
    }
    if (tags.length > 0) return;
      fetchTags();
  }, []);

  // init and pagination for Events
  useEffect(() => {
    const fetchEvents = async () => {
      if ((pagination.page === 0) || (events && !events.pagination.hasMore)) return;
      setIsLoadingEvents(true);
      try {
        const page = pagination.page === -1 ? 0 : pagination.page;
        const limit = pagination.limit;
        const selectedTag = tags.find(tag => tag._id === selectedCategory);
        const filter = selectedCategory !== DEFAULT_SELECTED_CATEGORY && selectedTag
          ? { category: selectedTag.name }
          : undefined;
        
        const newEvents = await EventService.getEvents({ 
          page, 
          limit,
          search: debouncedSearchTerm || undefined,
          filter: filter ? JSON.stringify(filter) : undefined
        }) as PaginationResponseDto<GetEventResponseDto | GetFullEventResponseDto>;
        
        setEvents((prev) => {
          if (!prev || pagination.page === -1) return newEvents;
          return {
            ...newEvents,
            data: [...prev.data, ...newEvents.data],
          };
        });
        setPagination(prev => ({
          ...prev,
          page: page === 0 ? 0 : newEvents.pagination.page,
        }));
      } catch (error) {
        const errorResponse : ErrorResponse = error as ErrorResponse;
        toast({
            title: t(TranslationConstants.COMMON.MESSAGES.ERROR),
            description: errorResponse.response?.data?.message || t(TranslationConstants.EVENTS.GET_EVENTS_FAILED),
            variant: ToastVariantsConstants.ERROR,
        });
      } finally {
        setIsLoadingEvents(false);
      }
    }
    fetchEvents();
  }, [pagination.page, debouncedSearchTerm, selectedCategory, tags]);

  // Reset pagination when search or category changes
  useEffect(() => {
    resetPage();
  }, [debouncedSearchTerm, selectedCategory]);

  // Detect scroll to bottom to load more events
  useEffect(() => {
    const handleScroll = () => {
      if (
        window.innerHeight + window.scrollY >= document.body.offsetHeight - 100 &&
        !isLoadingEvents &&
        events?.pagination.hasMore
      ) {
        setPagination((prev) => ({
          ...prev,
          page: prev.page + 1,
        }));
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isLoadingEvents, events]);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  }

  const handleCategoryChange = (value: string) => {
    setSelectedCategory(value);
  }

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="bg-gradient-to-r from-duck-nature/20 to-duck-water/30 dark:from-duck-brown/30 dark:to-duck-yellow/10 rounded-xl p-8 mb-8">
          <h1 className="text-3xl font-bold text-duck-brown dark:text-duck-yellow">
            {t(TranslationConstants.EVENTS.ALL_EVENTS)}
          </h1>
          <p className="text-gray-600 dark:text-gray-300 mt-2">
            {t(TranslationConstants.EVENTS.ALL_EVENTS_DESCRIPTION)}
          </p>
        </div>

        <div className="mb-8">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <Input
                placeholder={t(TranslationConstants.EVENTS.SEARCH_EVENTS)}
                value={searchTerm}
                onChange={handleSearch}
                className="border-duck-nature/20 focus-visible:ring-duck-nature"
              />
            </div>
            <div className="w-full md:w-64 rtl:ml-auto ltr:mr-auto">
              <Select value={selectedCategory} onValueChange={handleCategoryChange}>
                <SelectTrigger className="!border-duck-nature/20 focus:ring-duck-nature">
                  {isLoadingTags ? (
                    <LoadingSpinner className="w-6 h-6" />
                  ) : (
                    <SelectValue placeholder="Filter by Tag" />
                  )}
                </SelectTrigger>
                <SelectContent className="border-duck-nature/20">
                  {isLoadingTags ? (
                    <div className="flex justify-center items-center py-4">
                      <LoadingSpinner className="w-6 h-6" />
                    </div>
                  ) : (
                    <>
                      <SelectItem value={DEFAULT_SELECTED_CATEGORY}>
                        {t(TranslationConstants.EVENTS.ALL_TAGS)}
                      </SelectItem>
                      {tags.map(tag => (
                        <SelectItem key={tag._id} value={tag._id}>
                          <span className="flex items-center gap-2 rtl:flex-row-reverse">
                            <span
                              className="inline-block w-3 h-3 rounded-full"
                              style={{ backgroundColor: tag.color }}
                            />
                            {tag.name}
                          </span>
                        </SelectItem>
                      ))}
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="justify-end mb-4 hidden md:flex">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsGrid((prev) => !prev)}
            className="border border-duck-yellow/40"
            aria-label="Toggle layout"
          >
            {isGrid ? <LayoutList className="w-5 h-5" /> : <LayoutGrid className="w-5 h-5" />}
          </Button>
        </div>

        {events && events.data.length > 0 ? (
          <>
            {/* Grid layout */}
            <div className={`${isGrid ? '' : 'md:hidden'}`}>
              <EventGrid events={events.data} />
            </div>
            {/* List layout */}
            {!isGrid && (
              <div className="hidden md:block">
                <EventListLayout events={events.data} />
              </div>
            )}
            {/* Loader at the bottom for infinite scroll */}
            {isLoadingEvents && (
              <div className="flex justify-center py-4">
                <LoadingSpinner />
              </div>
            )}
          </>
        ) : isLoadingEvents ? (
          // Initial loading state (no events yet)
          <div className="flex justify-center py-20">
            <LoadingSpinner />
          </div>
        ) : (
          // No events and not loading
          <div className="text-center py-20">
            <p className="text-xl text-gray-500 dark:text-gray-400">
              {t(TranslationConstants.EVENTS.NO_EVENTS)}
            </p>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default EventList;