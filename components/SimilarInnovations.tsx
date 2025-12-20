import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { findSimilarInnovations, SimilarInnovation } from '../hooks/usePinecone';
import { Colors, Spacing, FontSizes } from '../constants/theme';

interface Props {
  query: string;
  onSelect?: (innovation: SimilarInnovation) => void;
  maxResults?: number;
  showTitle?: boolean;
}

/**
 * SimilarInnovations Component
 * 
 * Displays a horizontal scrollable list of similar innovations from Pinecone.
 * Uses semantic search to find relevant past innovations based on the query.
 * 
 * @param query - Search query (product description or innovation concept)
 * @param onSelect - Optional callback when user taps an innovation
 * @param maxResults - Number of results to show (default: 3)
 * @param showTitle - Whether to show the section title (default: true)
 */
export const SimilarInnovations = ({ 
  query, 
  onSelect, 
  maxResults = 3,
  showTitle = true 
}: Props) => {
  const [similar, setSimilar] = useState<SimilarInnovation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    const loadSimilar = async () => {
      if (!query || query.trim().length < 3) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      
      try {
        const results = await findSimilarInnovations(query, maxResults);
        setSimilar(results);
      } catch (err) {
        console.error('Failed to load similar innovations:', err);
        setError('Could not load similar innovations');
      } finally {
        setLoading(false);
      }
    };
    
    loadSimilar();
  }, [query, maxResults]);
  
  if (loading) {
    return (
      <View style={styles.container}>
        {showTitle && <Text style={styles.title}>💡 Finding Similar Innovations...</Text>}
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={Colors.accent} />
          <Text style={styles.loadingText}>Searching vector database...</Text>
        </View>
      </View>
    );
  }
  
  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="warning-outline" size={20} color={Colors.red[400]} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      </View>
    );
  }
  
  if (similar.length === 0) {
    return null; // Don't show anything if no results
  }
  
  return (
    <View style={styles.container}>
      {showTitle && (
        <View style={styles.header}>
          <Ionicons name="bulb-outline" size={20} color={Colors.accent} />
          <Text style={styles.title}>Similar Past Innovations</Text>
          <Text style={styles.badge}>{similar.length}</Text>
        </View>
      )}
      
      <FlatList
        data={similar}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity 
            style={styles.card}
            onPress={() => onSelect?.(item)}
            activeOpacity={0.7}
          >
            <View style={styles.cardHeader}>
              <Text style={styles.name} numberOfLines={2}>
                {item.conceptName}
              </Text>
              <View style={styles.scoreContainer}>
                <Text style={styles.score}>
                  {(item.score * 100).toFixed(0)}%
                </Text>
                <Text style={styles.scoreLabel}>match</Text>
              </View>
            </View>
            
            <Text style={styles.description} numberOfLines={3}>
              {item.conceptDescription}
            </Text>
            
            <View style={styles.footer}>
              <View style={styles.tags}>
                <View style={[styles.tag, styles.tagPattern]}>
                  <Ionicons name="repeat-sharp" size={12} color={Colors.secondary} />
                  <Text style={styles.tagText}>
                    {item.patternUsed.replace('_', ' ')}
                  </Text>
                </View>
                
                {item.noveltyScore > 0 && (
                  <View style={styles.tag}>
                    <Ionicons name="star" size={12} color={Colors.yellow[400]} />
                    <Text style={styles.tagText}>{item.noveltyScore}/10</Text>
                  </View>
                )}
                
                {item.viabilityScore > 0 && (
                  <View style={styles.tag}>
                    <Ionicons name="checkmark-circle" size={12} color={Colors.green[400]} />
                    <Text style={styles.tagText}>{item.viabilityScore}/10</Text>
                  </View>
                )}
              </View>
              
              {onSelect && (
                <Ionicons name="chevron-forward" size={16} color={Colors.gray[600]} />
              )}
            </View>
          </TouchableOpacity>
        )}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: Spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  title: {
    fontSize: FontSizes.md,
    fontWeight: 'bold',
    color: Colors.white,
    flex: 1,
  },
  badge: {
    backgroundColor: Colors.accent,
    color: Colors.black,
    fontSize: FontSizes.xs,
    fontWeight: 'bold',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: 12,
    overflow: 'hidden',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.lg,
  },
  loadingText: {
    color: Colors.gray[400],
    fontSize: FontSizes.sm,
    fontStyle: 'italic',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.red[900],
  },
  errorText: {
    color: Colors.red[400],
    fontSize: FontSizes.sm,
  },
  listContent: {
    paddingRight: Spacing.lg,
  },
  card: {
    backgroundColor: Colors.panel,
    borderRadius: 12,
    padding: Spacing.md,
    marginRight: Spacing.md,
    width: 280,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  name: {
    fontSize: FontSizes.md,
    fontWeight: 'bold',
    color: Colors.accent,
    flex: 1,
    lineHeight: FontSizes.md * 1.3,
  },
  scoreContainer: {
    alignItems: 'center',
  },
  score: {
    fontSize: FontSizes.lg,
    color: Colors.green[400],
    fontWeight: 'bold',
  },
  scoreLabel: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
    marginTop: -2,
  },
  description: {
    fontSize: FontSizes.sm,
    color: Colors.gray[300],
    marginBottom: Spacing.md,
    lineHeight: FontSizes.sm * 1.4,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tags: {
    flexDirection: 'row',
    gap: Spacing.xs,
    flex: 1,
    flexWrap: 'wrap',
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.dark,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.gray[800],
  },
  tagPattern: {
    borderColor: Colors.secondary,
    backgroundColor: 'rgba(251, 191, 36, 0.1)',
  },
  tagText: {
    fontSize: FontSizes.xs,
    color: Colors.gray[400],
    fontWeight: '600',
    textTransform: 'capitalize',
  },
});

export default SimilarInnovations;
